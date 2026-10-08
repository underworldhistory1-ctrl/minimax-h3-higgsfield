"""Real, offline CPU control extraction; dependency gaps never become fake maps."""
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
import threading
from .assembly import get_ffmpeg_path
from .control import canvas, prepare_control, run_control_ffmpeg, video_metadata
from .paths import owned_path

AUX_REVISION = '0cd290477128d42cdc3e76a826a402d866e8c684'
WEIGHTS = {
    'pose': [('yzd-v/DWPose/yolox_l.onnx', 216746733, '7860ae79de6c89a3c1eb72ae9a2756c0ccfbe04b7791bb5880afabd97855a411'),
             ('yzd-v/DWPose/dw-ll_ucoco_384.onnx', 134399116, '724f4ff2439ed61afb86fb8a1951ec39c6220682803b4a8bd4f598cd913b1843')],
    'depth': [('depth-anything/Depth-Anything-V2-Small/depth_anything_v2_vits.pth', 99218434, '715fade13be8f229f8a70cc02066f656f2423a59effd0579197bbf57860e1378')],
}
_VERIFIED = {}
CACHE_VERSION = 'h3-control-cpu-v1'
CACHE_MAX_ENTRIES = 8
CACHE_MAX_BYTES = 256 * 1024 * 1024
SOURCE_MAX_BYTES = 500 * 1024 * 1024
_CACHE_LOCK = threading.Lock()


def _file_digest(path, check):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            check()
            digest.update(block)
    check()
    return digest.hexdigest()


def _cache_key(source, kind, input_type, offset, width, height, length, check):
    options = {'source_sha256': _file_digest(source, check), 'kind': kind, 'input_type': input_type,
               'offset': float(offset), 'width': width, 'height': height, 'length': length,
               'fps': 24, 'algorithm': CACHE_VERSION, 'aux_revision': AUX_REVISION,
               'weights': WEIGHTS.get(kind, [])}
    return hashlib.sha256(json.dumps(options, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _copy_checked(source, target, check):
    with source.open('rb') as stream, target.open('xb') as output:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            check()
            output.write(block)
    check()


def _evict_cache(root, *, reserve_bytes=0, reserve_entries=0):
    entries = []
    for media in root.glob('*.mp4'):
        if len(media.stem) == 64 and all(c in '0123456789abcdef' for c in media.stem) and not media.with_suffix('.json').is_file():
            media.unlink(missing_ok=True)
    for manifest in root.glob('*.json'):
        if len(manifest.stem) != 64 or any(c not in '0123456789abcdef' for c in manifest.stem):
            continue
        media = root / (manifest.stem + '.mp4')
        try:
            size = manifest.stat().st_size + media.stat().st_size
            entries.append((manifest.stat().st_mtime_ns, manifest, media, size))
        except OSError:
            manifest.unlink(missing_ok=True)
            media.unlink(missing_ok=True)
    entries.sort(key=lambda item: item[0])
    total = sum(entry[3] for entry in entries)
    while entries and (len(entries) + reserve_entries > CACHE_MAX_ENTRIES or total + reserve_bytes > CACHE_MAX_BYTES):
        _, manifest, media, size = entries.pop(0)
        manifest.unlink(missing_ok=True)
        media.unlink(missing_ok=True)
        total -= size


def _cache_read(root, key, target, expected, check):
    with _CACHE_LOCK:
        manifest = owned_path(root, key + '.json', require_file=False)
        media = owned_path(root, key + '.mp4', require_file=False)
        if not manifest.is_file() or not media.is_file():
            return False
        try:
            if manifest.stat().st_size > 4096 or media.stat().st_size > CACHE_MAX_BYTES:
                raise ValueError('Invalid cached control bounds')
            record = json.loads(manifest.read_text())
            if not isinstance(record, dict) or record.get('version') != CACHE_VERSION or record.get('metadata') != expected or record.get('sha256') != _file_digest(media, check):
                raise ValueError('Cached control failed verification')
            if video_metadata(media) != expected:
                raise ValueError('Cached control metadata changed')
        except (OSError, ValueError, TypeError, subprocess.SubprocessError):
            check()  # Cancellation never removes an otherwise valid shared entry.
            manifest.unlink(missing_ok=True)
            media.unlink(missing_ok=True)
            return False
        _copy_checked(media, target, check)
        os.utime(manifest, None)
        return True


def _cache_publish(root, key, source, metadata, check):
    size = source.stat().st_size
    if size + 4096 > CACHE_MAX_BYTES:
        return
    # Stage outside the cache quota. Cancellation during copy never evicts entries.
    with tempfile.TemporaryDirectory(prefix='h3-control-cache-') as temporary:
        temporary_media = Path(temporary) / 'map.mp4'
        temporary_manifest = Path(temporary) / 'map.json'
        _copy_checked(source, temporary_media, check)
        record = {'version': CACHE_VERSION, 'metadata': metadata, 'sha256': _file_digest(temporary_media, check)}
        temporary_manifest.write_text(json.dumps(record, separators=(',', ':')))
        with _CACHE_LOCK:
            check()
            root.mkdir(parents=True, exist_ok=True)
            media = owned_path(root, key + '.mp4', require_file=False)
            manifest = owned_path(root, key + '.json', require_file=False)
            if manifest.is_file() and media.is_file():
                return
            _evict_cache(root, reserve_bytes=size + 4096, reserve_entries=1)
            # os.replace is atomic only within one volume. Copy to a unique local
            # stage after the cancellation commit point, then publish each file.
            local_media = root / (uuid.uuid4().hex + '.part')
            local_manifest = root / (uuid.uuid4().hex + '.part')
            try:
                shutil.copyfile(temporary_media, local_media)
                shutil.copyfile(temporary_manifest, local_manifest)
                local_media.replace(media)
                local_manifest.replace(manifest)
            finally:
                local_media.unlink(missing_ok=True)
                local_manifest.unlink(missing_ok=True)
                if media.is_file() and not manifest.is_file():
                    media.unlink(missing_ok=True)


def _aux_root(root=None):
    if root is not None:
        if hasattr(root, 'base_path'):
            root = Path(root.base_path) / 'custom_nodes' / 'comfyui_controlnet_aux'
        return Path(root).resolve()
    if os.environ.get('H3_CONTROL_AUX_ROOT'):
        return Path(os.environ['H3_CONTROL_AUX_ROOT']).resolve()
    try:
        import folder_paths
        return Path(folder_paths.base_path) / 'custom_nodes' / 'comfyui_controlnet_aux'
    except ImportError:
        return None


def _weight_ok(path, size, digest):
    try:
        stat = path.stat()
        if stat.st_size != size:
            return False
        key = (str(path.resolve()), stat.st_size, stat.st_mtime_ns)
        if key not in _VERIFIED:
            checksum = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
                    checksum.update(block)
            _VERIFIED[key] = checksum.hexdigest() == digest
        return _VERIFIED[key]
    except OSError:
        return False


def preprocessor_status(aux_root=None):
    root = _aux_root(aux_root)
    ckpts = Path(os.environ.get('AUX_ANNOTATOR_CKPTS_PATH', str(root / 'ckpts') if root else '.'))
    pinned = False
    if root and (root / '.git').exists():
        try:
            pinned = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True,
                                    text=True, check=True, timeout=5).stdout.strip() == AUX_REVISION
            if pinned:
                pinned = subprocess.run(['git', '-C', str(root), 'diff', '--quiet', 'HEAD', '--', 'src'],
                                        capture_output=True, timeout=5).returncode == 0
        except (OSError, subprocess.SubprocessError):
            pass
    result = {'aux_revision': AUX_REVISION}
    for kind in ('gray', 'canny', 'pose', 'depth'):
        reasons = []
        if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
            reasons.append('FFmpeg and FFprobe are required')
        dependencies = [] if kind == 'gray' else ['cv2', 'numpy']
        if kind in ('pose', 'depth'):
            dependencies += ['torch', 'einops', 'safetensors', 'huggingface_hub']
            if not pinned:
                reasons.append('Pinned comfyui_controlnet_aux extension is unavailable')
        if kind == 'pose':
            dependencies += ['onnxruntime','matplotlib']
        for dependency in dependencies:
            if importlib.util.find_spec(dependency) is None:
                reasons.append('Missing CPU dependency: ' + dependency)
        for relative, size, digest in WEIGHTS.get(kind, []):
            if not _weight_ok(ckpts / relative, size, digest):
                reasons.append('Missing or unverified local checkpoint: ' + relative)
        result[kind] = {'ready': not reasons, 'reasons': reasons, 'device': 'cpu'}
    return result


def _cpu_model(kind, root):
    """Use pinned direct constructors; from_pretrained could initiate downloads."""
    import numpy as np
    import cv2
    import torch
    src = str(root / 'src')
    if src not in sys.path:
        sys.path.insert(0, src)
    existing = sys.modules.get('custom_controlnet_aux.util')
    if existing and not Path(existing.__file__).resolve().is_relative_to((root / 'src').resolve()):
        raise ValueError('A different auxiliary preprocessor package is loaded')
    ckpts = Path(os.environ.get('AUX_ANNOTATOR_CKPTS_PATH', str(root / 'ckpts')))
    if kind == 'pose':
        import onnxruntime as ort
        from custom_controlnet_aux.dwpose import DwposeDetector
        from custom_controlnet_aux.dwpose.wholebody import Wholebody
        from custom_controlnet_aux.dwpose.util import guess_onnx_input_shape_dtype
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        body = Wholebody()
        body.det_filename, body.pose_filename = 'yolox_l.onnx', 'dw-ll_ucoco_384.onnx'
        body.det_model_type = body.pose_model_type = 'ort'
        body.det = ort.InferenceSession(str(ckpts / WEIGHTS['pose'][0][0]), sess_options=options, providers=['CPUExecutionProvider'])
        body.pose = ort.InferenceSession(str(ckpts / WEIGHTS['pose'][1][0]), sess_options=options, providers=['CPUExecutionProvider'])
        body.pose_input_size, _ = guess_onnx_input_shape_dtype(body.pose_filename)
        detector = DwposeDetector(body)
        return detector, lambda frame: cv2.cvtColor(np.asarray(detector(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
                 detect_resolution=512, output_type='np', include_body=True, include_hand=True, include_face=True)), cv2.COLOR_RGB2BGR)
    from custom_controlnet_aux.depth_anything_v2 import DepthAnythingV2Detector, model_configs
    from custom_controlnet_aux.depth_anything_v2 import dpt
    class CpuDepthAnythingV2(dpt.DepthAnythingV2):
        def image2tensor(self, raw_image, input_size=518):
            # Upstream chooses CUDA/MPS here even after model.to('cpu'); explicitly
            # preserve its transforms while keeping every input tensor on CPU.
            transform = dpt.Compose([dpt.Resize(width=input_size, height=input_size, resize_target=False,
                keep_aspect_ratio=True, ensure_multiple_of=14, resize_method='lower_bound',
                image_interpolation_method=cv2.INTER_CUBIC),
                dpt.NormalizeImage(mean=[.485, .456, .406], std=[.229, .224, .225]), dpt.PrepareForNet()])
            image = cv2.cvtColor(raw_image, cv2.COLOR_BGR2RGB) / 255.0
            image = transform({'image': image})['image']
            return torch.from_numpy(image).unsqueeze(0).to('cpu'), raw_image.shape[:2]
    name = 'depth_anything_v2_vits.pth'
    model = CpuDepthAnythingV2(**model_configs[name])
    model.load_state_dict(torch.load(ckpts / WEIGHTS['depth'][0][0], map_location='cpu', weights_only=True))
    model.eval().to('cpu')
    detector = DepthAnythingV2Detector(model, name).to('cpu')
    def infer(frame):
        with torch.inference_mode():
            return np.asarray(detector(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), detect_resolution=512, output_type='np'))
    return detector, infer


def process_control(source, input_root, width, height, length, kind, *, input_type='video', offset=0,
                    cancel_event=None, progress=None, aux_root=None):
    canvas(width, height, length)
    if input_type not in ('video', 'prepared') or kind not in ('canny', 'gray', 'pose', 'depth', 'inpaint', 'hed', 'mlsd', 'scribble', 'layout'):
        raise ValueError('Unknown control input type or kind')
    if input_type == 'video' and kind not in ('canny', 'gray', 'pose', 'depth'):
        raise ValueError('This control kind requires an advanced prepared map')
    def check():
        if cancel_event is not None and cancel_event.is_set():
            raise ValueError('Control preparation cancelled')
    def report(done, phase):
        check()
        if progress:
            progress(done, length, phase)
        check()
    source_path = source if isinstance(source, Path) else owned_path(input_root, source)
    source_name = source_path.resolve().relative_to(Path(input_root).resolve()).as_posix()
    source_path = owned_path(input_root, source_name)
    if source_path.stat().st_size > SOURCE_MAX_BYTES:
        raise ValueError('Control source exceeds the 500 MB preparation limit')
    source_metadata = video_metadata(source_path)
    check()
    if input_type == 'video':
        status = preprocessor_status(aux_root)[kind]
        if not status['ready']:
            raise ValueError('Control preprocessor unavailable: ' + '; '.join(status['reasons']))
    cache_root = owned_path(input_root, '.h3_control_cache', require_file=False)
    key = _cache_key(source_path, kind, input_type, offset, width, height, length, check) if input_type == 'video' else None
    expected = {'width': width, 'height': height, 'fps': 24.0, 'frame_count': length}
    normalized = None
    output = None
    model = transform = capture = None
    try:
        report(0, 'normalize')
        normalized = prepare_control(source_name, input_root, width, height, length,
                                     start_seconds=offset, cancel_event=cancel_event)
        aligned = owned_path(input_root, normalized['filename'])
        if input_type == 'prepared':
            report(length, 'verify')
            return dict(normalized, source_metadata=source_metadata, kind=kind, input_type=input_type,
                        source_file=normalized['filename'], provenance={'preprocessor': 'user_prepared', 'device': 'none', 'cache_hit': False})
        filename = 'h3_studio_kf_control_' + uuid.uuid4().hex + '.mp4'
        output = owned_path(input_root, filename, require_file=False)
        cache_hit = _cache_read(cache_root, key, output, expected, check) if cache_root.is_dir() else False
        if cache_hit:
            report(length, 'cached')
        else:
            report(0, 'process')
        if not cache_hit:
            if kind == 'gray':
                run_control_ffmpeg([get_ffmpeg_path(), '-nostdin', '-v', 'error', '-i', str(aligned), '-an',
                    '-vf', 'format=gray', '-frames:v', str(length), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                    '-threads', '2', '-y', str(output)], cancel_event=cancel_event)
            else:
                import cv2
                if kind == 'canny':
                    transform = lambda frame: cv2.Canny(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), 100, 200)
                else:
                    model, transform = _cpu_model(kind, _aux_root(aux_root))
                capture = cv2.VideoCapture(str(aligned))
                deadline = time.monotonic() + 1800
                with tempfile.TemporaryDirectory(prefix='h3-control-') as temporary:
                    for index in range(length):
                        check()
                        if time.monotonic() > deadline:
                            raise ValueError('CPU control extraction exceeded its time limit')
                        ok, frame = capture.read()
                        if not ok:
                            raise ValueError('Aligned source could not be decoded completely')
                        mapped = transform(frame)
                        if mapped is None or getattr(mapped, 'size', 0) == 0:
                            raise ValueError('Control preprocessor returned no map')
                        mapped = cv2.resize(mapped, (width, height), interpolation=cv2.INTER_LINEAR)
                        if not cv2.imwrite(str(Path(temporary) / f'{index:04d}.png'), mapped):
                            raise ValueError('Control map could not be saved')
                        report(index + 1, 'process')
                    run_control_ffmpeg([get_ffmpeg_path(), '-nostdin', '-v', 'error', '-framerate', '24',
                        '-i', str(Path(temporary) / '%04d.png'), '-frames:v', str(length), '-an', '-c:v',
                        'libx264', '-pix_fmt', 'yuv420p', '-threads', '2', '-y', str(output)], cancel_event=cancel_event)
        report(length, 'verify')
        metadata = video_metadata(output)
        if metadata != {'width': width, 'height': height, 'fps': 24.0, 'frame_count': length}:
            raise ValueError('Extracted control does not match the target canvas and frames')
        if not cache_hit:
            _cache_publish(cache_root, key, output, metadata, check)
        check()
        return dict(metadata, filename=filename, length=length, kind=kind, input_type=input_type,
                    source_filename=source_name, source_file=normalized['filename'], source_metadata=source_metadata,
                    provenance={'preprocessor': {'canny': 'opencv_canny_100_200', 'gray': 'ffmpeg_gray',
                        'pose': 'dwpose', 'depth': 'depth_anything_v2_small'}[kind], 'device': 'cpu',
                        'aux_revision': AUX_REVISION if kind in ('pose', 'depth') else None, 'cache_hit': cache_hit,
                        'algorithm_version': CACHE_VERSION})
    except Exception:
        if capture:
            capture.release()
            capture = None
        if output:
            output.unlink(missing_ok=True)
        if normalized:
            owned_path(input_root, normalized['filename'], require_file=False).unlink(missing_ok=True)
        raise
    finally:
        if capture:
            capture.release()
        transform = model = None
        gc.collect()
