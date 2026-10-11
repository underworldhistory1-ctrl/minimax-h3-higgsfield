"""Pinned, sequential model preparation. The launcher owns the process lock.

Planning never writes. Attached stores are only read; completion replaces targets
atomically after verification. Hash receipts are keyed by file identity and times.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    from . import download_h3_models as h3
    from . import download_optional_loras as loras
    from . import download_refine_models as refine_models
    from . import download_control_models as control_models
    from . import download_control_preprocessors as preprocessors
    from . import download_qwen_image_models as qwen
except ImportError:
    import download_h3_models as h3
    import download_optional_loras as loras
    import download_refine_models as refine_models
    import download_control_models as control_models
    import download_control_preprocessors as preprocessors
    import download_qwen_image_models as qwen


@dataclass(frozen=True)
class Artifact:
    relative_path: str
    url: str
    size: int
    sha256: str | None


# Official HF API blobs metadata for MODEL_REVISION, verified 2026-10-12.
H3_HASHES = (
    'e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a',
    '35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6',
    '7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522',
    '8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48',
    '9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779',
)


def manifest(turbo=False, refine=True, controlnet=True, qwen_profiles='int8'):
    result = [Artifact('models/'+name,
                       f'https://huggingface.co/{h3.MODEL_REPO}/resolve/{h3.MODEL_REVISION}/{name}', size, digest)
              for (name, size), digest in zip(h3.MODELS, H3_HASHES)]
    # Existing Combat URL used main; official metadata confirms this immutable
    # revision carries the existing pinned digest and size.
    result.extend(Artifact('models/loras/'+name,
                          url.replace('/resolve/main/', '/resolve/233a183fb7d28b3b10d777b00d9b3ed3c691af81/'),
                          size, digest) for name, url, digest, size in loras.LORAS)
    if turbo:
        result.append(Artifact('models/loras/'+h3.TURBO_FILE,
            f'https://huggingface.co/{h3.TURBO_REPO}/resolve/{h3.TURBO_REVISION}/{h3.TURBO_FILE}', h3.TURBO_SIZE, h3.TURBO_SHA256))
    for enabled, module, folder in ((refine, refine_models, 'latent_upscale_models'), (controlnet, control_models, 'model_patches')):
        if enabled:
            result.append(Artifact(f'models/{folder}/{module.MODEL_NAME}', module.MODEL_URL, module.MODEL_SIZE, module.MODEL_SHA256))
    if controlnet:
        for repo, revision, name, digest, size in preprocessors.MODELS:
            result.append(Artifact(f'custom_nodes/comfyui_controlnet_aux/ckpts/{repo}/{name}',
                f'https://huggingface.co/{repo}/resolve/{revision}/{name}', size, digest))
    for item in qwen.selected_files(qwen.parse_profiles(qwen_profiles or '')):
        name = f'{item.folder}/{item.name}'
        result.append(Artifact('models/'+name,
            f'https://huggingface.co/{qwen.MODEL_REPO}/resolve/{qwen.MODEL_REVISION}/{name}', item.size, item.sha256))
    return result


def _identity(path):
    stat = path.stat()
    return [str(path.resolve()), stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns]


def _receipts(state_dir):
    try:
        data = json.loads((Path(state_dir)/'model-receipts.json').read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def _valid(path, artifact, receipts):
    try:
        if not path.is_file() or path.stat().st_size != artifact.size:
            return False
        identity = _identity(path)
        key = str(path.absolute())
        if artifact.sha256:
            receipt = receipts.get(key, receipts.get(str(path.resolve()), {}))
            if receipt.get('identity') == identity and receipt.get('sha256') == artifact.sha256:
                return True
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(8*1024*1024), b''):
                    digest.update(block)
            if digest.hexdigest() != artifact.sha256:
                return False
            # A changed file during verification cannot receive a valid receipt.
            if _identity(path) != identity:
                return False
            receipts[key] = {'identity': identity, 'sha256': artifact.sha256, 'validation': 'sha256'}
            return True
        return h3.valid_safetensors(path, artifact.size)
    except (OSError, ValueError):
        return False


def _target(comfy_root, artifact):
    relative = Path(artifact.relative_path)
    if relative.is_absolute() or '..' in relative.parts or artifact.size <= 0:
        raise ValueError('Invalid model artifact path or size')
    if artifact.sha256 is not None and not re.fullmatch('[0-9a-f]{64}', artifact.sha256):
        raise ValueError('Invalid artifact SHA-256')
    target = comfy_root / relative
    return target


def _writable_target(comfy_root, target):
    if not target.parent.resolve().is_relative_to(comfy_root.resolve()):
        raise ValueError('Model destination parent escapes ComfyUI through a symlink; use an attached root instead')


def _discover(roots, filenames):
    found = {name: [] for name in filenames}
    for root in roots:
        root = Path(root)
        if not root.is_dir():
            continue
        for directory, dirs, files in os.walk(root, followlinks=False):
            depth = len(Path(directory).relative_to(root).parts)
            dirs[:] = sorted(d for d in dirs if d.lower() not in {'.git', '.cache', 'cache', 'output', 'outputs', 'node_modules'} and not (Path(directory)/d).is_symlink()) if depth < 4 else []
            for name in filenames.intersection(files):
                found[name].append(Path(directory)/name)
    return found


def plan_models(comfy_root, roots, artifacts, state_dir):
    comfy_root = Path(comfy_root).absolute()
    if len({a.relative_path for a in artifacts}) != len(artifacts):
        raise ValueError('Duplicate model destination')
    receipts = _receipts(state_dir)
    sources = _discover(roots, {Path(a.relative_path).name for a in artifacts})
    items = []
    for artifact in artifacts:
        target = _target(comfy_root, artifact)
        source = None
        if _valid(target, artifact, receipts):
            action = 'reuse'
        else:
            source = next((p for p in sources[target.name] if p.absolute() != target.absolute() and _valid(p, artifact, receipts)), None)
            action = 'link' if source else 'download'
        if action != 'reuse':
            _writable_target(comfy_root, target)
        items.append({'target': target, 'source': source, 'artifact': artifact, 'action': action})
    return {'missing_bytes': sum(i['artifact'].size for i in items if i['action'] == 'download'), 'items': items, '_receipts': receipts}


def _existing_parent(path):
    while not path.exists():
        path = path.parent
    return path


def _space(path, needed):
    if shutil.disk_usage(_existing_parent(Path(path))).free < needed:
        raise RuntimeError(f'Insufficient free storage: need {needed} bytes for model preparation')


def _quarantine(path):
    if path.exists() or path.is_symlink():
        path.rename(path.with_name(path.name+'.quarantine-'+uuid.uuid4().hex))


def _replace_verified(source, target, artifact, receipts):
    """Carry a verified receipt across our atomic rename, checking file identity.

    Rename changes the path and can change ctime, but device/inode/size/mtime
    must remain identical. A concurrent content change cannot inherit a receipt.
    """
    before = _identity(source)
    receipt = receipts.get(str(source.absolute()), receipts.get(str(source.resolve()), {}))
    verified = artifact.sha256 and receipt.get('identity') == before and receipt.get('sha256') == artifact.sha256
    source.replace(target)
    after = _identity(target)
    if before[1:5] != after[1:5]:
        raise RuntimeError('Model file changed during atomic completion')
    if verified:
        receipts[str(target.absolute())] = {'identity': after, 'sha256': artifact.sha256, 'validation': 'sha256'}


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        destination = urllib.parse.urlparse(newurl)
        if redirected is not None and (destination.hostname != 'huggingface.co' or destination.scheme != 'https'):
            redirected.remove_header('Authorization')
        return redirected


def _download(target, artifact, receipts, emit):
    part = target.with_name(target.name+'.part')
    if part.is_symlink() or (part.exists() and part.stat().st_nlink > 1):
        _quarantine(part)
    opener = urllib.request.build_opener(_SafeRedirect())
    for attempt in range(3):
        offset = part.stat().st_size if part.exists() else 0
        if offset >= artifact.size:
            if offset == artifact.size and _valid(part, artifact, receipts):
                _replace_verified(part, target, artifact, receipts)
                return
            _quarantine(part)
            offset = 0
        headers = {'User-Agent': 'H3-Studio-Launcher/1.0', 'Accept-Encoding': 'identity'}
        if offset:
            headers['Range'] = f'bytes={offset}-'
        parsed = urllib.parse.urlparse(artifact.url)
        if parsed.scheme == 'https' and parsed.hostname == 'huggingface.co' and os.environ.get('HF_TOKEN'):
            headers['Authorization'] = 'Bearer '+os.environ['HF_TOKEN']
        try:
            with opener.open(urllib.request.Request(artifact.url, headers=headers), timeout=60) as response:
                resumed = response.status == 206
                if resumed:
                    content_range = response.headers.get('Content-Range', '')
                    if not content_range.startswith(f'bytes {offset}-') or not content_range.endswith(f'/{artifact.size}'):
                        raise ValueError('Invalid server range response')
                elif response.status != 200:
                    raise ValueError('Unexpected model response status')
                mode = 'ab' if resumed and offset else 'wb'
                received = offset if mode == 'ab' else 0
                last_progress = time.monotonic()
                with part.open(mode) as output:
                    while block := response.read(1024*1024):
                        received += len(block)
                        if received > artifact.size:
                            raise ValueError('Model transfer exceeds pinned size')
                        output.write(block)
                        now = time.monotonic()
                        if now-last_progress >= 10:
                            emit(f'Downloading {artifact.relative_path}: {received}/{artifact.size} bytes')
                            last_progress = now
                    output.flush()
                    os.fsync(output.fileno())
                if received < artifact.size:
                    raise http.client.IncompleteRead(b'', artifact.size-received)
            if not _valid(part, artifact, receipts):
                raise ValueError('Model transfer failed size/SHA-256 validation')
            _replace_verified(part, target, artifact, receipts)
            return
        except urllib.error.HTTPError as exc:
            # Only transient server failures are retried; credentials/404 need action.
            exc.close()
            if exc.code not in (408, 429, 500, 502, 503, 504):
                raise RuntimeError(f'Model download HTTP {exc.code}; check source access') from None
            if attempt == 2:
                raise RuntimeError(f'Model download HTTP {exc.code} after retries') from None
        except (urllib.error.URLError, http.client.IncompleteRead, ConnectionError, socket.timeout) as exc:
            if attempt == 2:
                raise RuntimeError('Model transfer interrupted after three attempts; partial file preserved') from None
        except ValueError:
            _quarantine(part)
            raise
        emit(f'Model transfer interrupted; resuming attempt {attempt+2}/3')
        time.sleep(0.2*(attempt+1))


def prepare_models(comfy_root, roots, artifacts, state_dir, emit=print):
    plan = plan_models(comfy_root, roots, artifacts, state_dir)
    # Group downloads by destination filesystem; include full size even when
    # partial data exist, because a server may ignore Range and restart the file.
    allocation = {}
    for item in plan['items']:
        if item['action'] == 'download':
            parent = _existing_parent(item['target'].parent)
            device = parent.stat().st_dev
            allocation.setdefault(device, [parent, 0])[1] += item['artifact'].size
    for parent, needed in allocation.values():
        _space(parent, needed)
    report = {'reused': [], 'downloaded': [], 'linked': [], 'missing_bytes': plan['missing_bytes'], 'validation': {}}
    receipts = plan['_receipts']
    for item in plan['items']:
        target, source, artifact, action = (item[k] for k in ('target', 'source', 'artifact', 'action'))
        emit(f'{action.capitalize()}: {artifact.relative_path}')
        if action == 'reuse':
            if not _valid(target, artifact, receipts):
                raise RuntimeError('Model changed after planning; rerun preparation')
            report['reused'].append(str(target))
        else:
            _target(Path(comfy_root).absolute(), artifact)
            _writable_target(Path(comfy_root).absolute(), target)
            target.parent.mkdir(parents=True, exist_ok=True)
            if action == 'link':
                if not _valid(source, artifact, receipts):
                    raise RuntimeError('Attached model changed after planning')
                temporary = target.with_name(target.name+'.link-'+uuid.uuid4().hex)
                try:
                    try:
                        temporary.symlink_to(source.resolve())
                    except OSError:
                        before_link = _identity(source)
                        try:
                            os.link(source, temporary)
                        except OSError:
                            _space(target.parent, artifact.size)
                            shutil.copyfile(source, temporary)
                        else:
                            after_link = _identity(source)
                            if before_link[1:5] != after_link[1:5]:
                                raise RuntimeError('Attached model changed while linking')
                            # Our hardlink changes inode ctime on both names.
                            # The verified content and identity otherwise agree.
                            receipt = receipts.get(str(source.absolute()), {})
                            if artifact.sha256 and receipt.get('identity') == before_link and receipt.get('sha256') == artifact.sha256:
                                receipts[str(source.absolute())] = {'identity': after_link, 'sha256': artifact.sha256, 'validation': 'sha256'}
                                receipts[str(temporary.absolute())] = {'identity': _identity(temporary), 'sha256': artifact.sha256, 'validation': 'sha256'}
                    if not _valid(temporary, artifact, receipts):
                        raise ValueError('Linked/copied model failed verification')
                    _quarantine(target)
                    _replace_verified(temporary, target, artifact, receipts)
                finally:
                    temporary.unlink(missing_ok=True)
                report['linked'].append(str(target))
            else:
                _quarantine(target)
                _download(target, artifact, receipts, emit)
                report['downloaded'].append(str(target))
        report['validation'][str(target)] = 'sha256' if artifact.sha256 else 'structural-only'
        _valid(target, artifact, receipts)
        Path(state_dir).mkdir(parents=True, exist_ok=True)
        receipt_path = Path(state_dir)/'model-receipts.json'
        temporary = receipt_path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(receipts, indent=2), encoding='utf-8')
        temporary.replace(receipt_path)
    return report
