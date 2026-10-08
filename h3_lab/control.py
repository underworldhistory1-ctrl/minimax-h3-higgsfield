"""Bounded, file-backed preparation and validation of native H3 structural controls."""
import math
import subprocess
import uuid
from fractions import Fraction
from PIL import Image
from .paths import owned_path
from .assembly import inspect_media, get_ffmpeg_path

CONTROL_FILE = 'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors'
CONTROL_SIZE = 4531220608


def canvas(width, height, length):
    if any(isinstance(v, bool) or not isinstance(v, int) for v in (width, height, length)):
        raise ValueError('Canvas and frame count must be integers')
    if not (256 <= width <= 1920 and 256 <= height <= 1920 and width % 32 == height % 32 == 0 and 1 <= length <= 362):
        raise ValueError('Unsupported control canvas or frame count')


def video_metadata(path):
    info = inspect_media(str(path))
    stream = next((v for v in info.get('streams', []) if v.get('codec_type') == 'video'), None)
    if not stream:
        raise ValueError('Control input has no video stream')
    try:
        result = {'width': int(stream['width']), 'height': int(stream['height']),
                  'fps': float(Fraction(stream['r_frame_rate'])),
                  'frame_count': int(stream.get('nb_read_frames') or stream.get('nb_frames') or 0)}
    except (ValueError, KeyError, ZeroDivisionError) as exc:
        raise ValueError('Control input metadata is incomplete') from exc
    if not result['frame_count'] or not math.isfinite(result['fps']) or result['fps'] <= 0:
        raise ValueError('Control input has no decodable frames')
    return result


def prepare_control(source, input_root, width, height, length, *, start_seconds=0):
    canvas(width, height, length)
    start_seconds = float(start_seconds)
    if not math.isfinite(start_seconds) or start_seconds < 0:
        raise ValueError('Invalid control source offset')
    source = str(source.relative_to(__import__('pathlib').Path(input_root).resolve())) if isinstance(source, __import__('pathlib').Path) else source
    source_path = owned_path(input_root, source)
    metadata = video_metadata(source_path)
    if metadata['frame_count'] / metadata['fps'] + 1 / 24 < start_seconds + length / 24:
        raise ValueError('Control source is shorter than the requested span')
    filename = 'h3_studio_kf_control_' + uuid.uuid4().hex + '.mp4'
    output = owned_path(input_root, filename, require_file=False)
    try:
        subprocess.run([get_ffmpeg_path(), '-nostdin', '-v', 'error', '-ss', str(start_seconds),
                        '-i', str(source_path), '-map', '0:v:0', '-an', '-vf',
                        f'fps=24,scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1',
                        '-frames:v', str(length), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-threads', '2', '-y', str(output)], check=True, capture_output=True, timeout=180)
        aligned = video_metadata(output)
        if aligned != {'width': width, 'height': height, 'fps': 24.0, 'frame_count': length}:
            raise ValueError('Prepared control failed exact frame alignment')
    except Exception:
        output.unlink(missing_ok=True)
        raise
    return dict(aligned, filename=filename, source_filename=source, length=length)


def validate_control_graph(spec, input_root, caps):
    render = spec.get('render_spec', spec)
    graph = spec.get('workflow', spec.get('graph', {}))
    control = render.get('control')
    apply_entries = [(str(k), v) for k, v in graph.items() if v.get('class_type') == 'MiniMaxH3FunControlNetApply']
    apply_nodes = [v for _, v in apply_entries]
    if not control or control.get('enabled') is False:
        if apply_nodes:
            raise ValueError('Control graph lacks an explicit control specification')
        return None
    if caps.get('controlnet_ready') is not True:
        raise ValueError('ControlNet 2.0 is unavailable: ' + '; '.join(caps.get('controlnet_missing_reasons', [])))
    if render.get('mode') not in ('text', 'frames', 'Text', 'Frames') or render.get('continuation') or render.get('enable_refine') or render.get('refine'):
        raise ValueError('ControlNet supports FL2VA Text/Frames without continuation or refine')
    width, height = (int(render[k]) for k in ('width', 'height'))
    length = int(render.get('target_frames', render.get('length', 0)))
    canvas(width, height, length)
    strength = float(control.get('strength', 1))
    start = float(control.get('start_percent', 0))
    end = float(control.get('end_percent', 1))
    if not all(math.isfinite(x) for x in (strength, start, end)) or not (0 < strength <= 10 and 0 <= start < end <= 1):
        raise ValueError('Invalid control strength or sampling range')
    video = control.get('control_file', control.get('control_video', control.get('video')))
    source = control.get('source_file', control.get('source_video', control.get('source')))
    mask = control.get('mask_file', control.get('mask'))
    if not video and not mask:
        raise ValueError('Control requires prepared video or an explicit source and mask')
    if bool(mask) != bool(source):
        raise ValueError('Masked control requires both source video and static mask')
    for name in (video, source):
        if name and video_metadata(owned_path(input_root, name)) != {'width': width, 'height': height, 'fps': 24.0, 'frame_count': length}:
            raise ValueError('Control videos must match exact canvas, 24 fps and target frames')
    if mask:
        with Image.open(owned_path(input_root, mask)) as image:
            image.load()
            if image.size != (width, height) or getattr(image, 'n_frames', 1) != 1:
                raise ValueError('Static mask must match the target canvas')
    if len(apply_nodes) != 1:
        raise ValueError('Workflow must contain one native ControlNet apply node')
    inputs = apply_nodes[0]['inputs']
    generators = [v for v in graph.values() if v.get('class_type') == 'MiniMaxH3ImageToVideo']
    if len(generators) != 1 or any(generators[0].get('inputs', {}).get(k) != value for k, value in [('width', width), ('height', height), ('length', length)]):
        raise ValueError('Control canvas and frame count disagree with the generation graph')
    vae_link = inputs.get('vae', [])
    vae_loader = graph.get(str(vae_link[0]), {}) if len(vae_link) == 2 and vae_link[1] == 0 else {}
    if vae_loader.get('class_type') != 'VAELoader' or vae_loader.get('inputs', {}).get('vae_name') != 'minimax_h3_video_vae_fp16.safetensors':
        raise ValueError('Control requires the exact native video VAE')
    for key, expected in [('strength', strength), ('start_percent', start), ('end_percent', end)]:
        if inputs.get(key) != expected:
            raise ValueError('Workflow control options disagree with the request')
    def linked(node_input, class_name, field, filename, output=0):
        link = inputs.get(node_input)
        if not filename:
            if link is not None:
                raise ValueError('Workflow has an undeclared control input')
            return
        if not isinstance(link, list) or len(link) != 2 or link[1] != output:
            raise ValueError('Invalid control graph link')
        node = graph.get(str(link[0]), {})
        if class_name == 'GetVideoComponents':
            if node.get('class_type') != class_name:
                raise ValueError('Control video requires native video components')
            video_link = node.get('inputs', {}).get('video', [])
            node = graph.get(str(video_link[0]), {}) if len(video_link) == 2 and video_link[1] == 0 else {}
            class_name = 'LoadVideo'
        if node.get('class_type') != class_name or node.get('inputs', {}).get(field) != filename:
            raise ValueError('Workflow control files disagree with the request')
    linked('control_video', 'GetVideoComponents', 'file', video)
    linked('source_video', 'GetVideoComponents', 'file', source)
    if mask:
        mask_link = inputs.get('mask', [])
        mask_node = graph.get(str(mask_link[0]), {}) if len(mask_link) == 2 and mask_link[1] == 0 else {}
        if mask_node.get('class_type') != 'ImageToMask' or mask_node.get('inputs', {}).get('channel') != 'red':
            raise ValueError('Static mask requires an explicit red-channel ImageToMask')
        image_link = mask_node.get('inputs', {}).get('image', [])
        image_node = graph.get(str(image_link[0]), {}) if len(image_link) == 2 and image_link[1] == 0 else {}
        if image_node.get('class_type') != 'LoadImage' or image_node.get('inputs', {}).get('image') != mask:
            raise ValueError('Mask file disagrees with request')
    elif inputs.get('mask') is not None:
        raise ValueError('Workflow has an undeclared mask')
    patch = inputs.get('model_patch', [])
    loader = graph.get(str(patch[0]), {}) if len(patch) == 2 and patch[1] == 0 else {}
    if loader.get('class_type') != 'ModelPatchLoader' or loader.get('inputs', {}).get('name') != CONTROL_FILE:
        raise ValueError('Workflow requires the exact ControlNet 2.0 patch')
    if any(v.get('class_type') in ('MiniMaxH3ReferenceToVideo', 'MinimaxH3LatentUpscaler3D') for v in graph.values()):
        raise ValueError('Unsupported ControlNet workflow combination')
    samplers = [v for v in graph.values() if v.get('class_type') == 'KSampler']
    if len(samplers) != 1:
        raise ValueError('Control requires one generation sampler')
    sampler_link = samplers[0].get('inputs', {}).get('model')
    sampler_visited = set()
    while sampler_link != [apply_entries[0][0], 0]:
        if not isinstance(sampler_link, list) or len(sampler_link) != 2 or sampler_link[1] != 0 or str(sampler_link[0]) in sampler_visited:
            raise ValueError('Sampler model path does not contain the declared control patch')
        sampler_visited.add(str(sampler_link[0]))
        node = graph.get(str(sampler_link[0]), {})
        if node.get('class_type') not in ('MiniMaxH3SigmaShift', 'LoraLoaderModelOnly', 'SpectrumApplyMiniMaxH3', 'MiniMaxH3MotionCache'):
            raise ValueError('Sampler model path does not contain the declared control patch')
        sampler_link = node.get('inputs', {}).get('model')
    visited = set()
    model_link = inputs.get('model')
    while isinstance(model_link, list) and len(model_link) == 2 and model_link[1] == 0:
        node_id = str(model_link[0])
        if node_id in visited:
            raise ValueError('Cyclic control model path')
        visited.add(node_id)
        node = graph.get(node_id, {})
        if node.get('class_type') == 'UNETLoader':
            if node.get('inputs', {}).get('unet_name') != 'minimax_h3_fl2va_pruned_int8_convrot.safetensors':
                raise ValueError('Control requires the exact FL2VA model')
            break
        if node.get('class_type') not in ('MiniMaxH3SigmaShift', 'LoraLoaderModelOnly', 'SpectrumApplyMiniMaxH3', 'MiniMaxH3MotionCache'):
            raise ValueError('Unsupported control model path')
        model_link = node.get('inputs', {}).get('model')
    else:
        raise ValueError('Control graph lacks a verified FL2VA model path')
    return {'control_video': video, 'source_video': source, 'mask': mask, 'strength': strength, 'start_percent': start, 'end_percent': end}
