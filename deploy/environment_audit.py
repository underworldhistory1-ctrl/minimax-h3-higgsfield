"""Lightweight reproducibility probe, run in the chosen ComfyUI interpreter."""
import importlib.metadata
import json
import platform
import subprocess
import sys


def audit():
    result = {'python': sys.version.split()[0], 'platform': platform.platform(), 'packages': {}, 'issues': [], 'gpu_validated': False}
    for name in ('torch', 'torchvision', 'torchaudio', 'comfyui-frontend-package', 'aiohttp', 'av', 'safetensors', 'numpy'):
        try:
            result['packages'][name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            result['issues'].append('Missing package: ' + name)
    # pip check finds inconsistent version constraints; it never installs anything.
    checked = subprocess.run([sys.executable, '-m', 'pip', 'check'], capture_output=True, text=True, timeout=60)
    result['dependency_consistent'] = checked.returncode == 0
    if checked.returncode:
        result['issues'].append('Python dependency constraints are inconsistent. Run pip check in the ComfyUI interpreter.')
    try:
        import torch
        result['cuda'] = torch.version.cuda
        result['cuda_available'] = torch.cuda.is_available()
        if not result['cuda_available']:
            result['issues'].append('CUDA GPU unavailable')
        else:
            result['gpu'] = torch.cuda.get_device_name(0)
            result['compute_capability'] = list(torch.cuda.get_device_capability(0))
            result['vram_bytes'] = torch.cuda.get_device_properties(0).total_memory
    except (ImportError, RuntimeError, OSError) as error:
        result['issues'].append('PyTorch probe failed: ' + type(error).__name__)
    result['ready'] = not result['issues']
    return result


if __name__ == '__main__':
    print(json.dumps(audit()))
