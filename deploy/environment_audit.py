"""Lightweight reproducibility probe, run in the chosen ComfyUI interpreter."""
import importlib.metadata
import json
import platform
import subprocess
import sys


MIN_CUDA = (13, 0)
MIN_DRIVER_MAJOR = 580


def check_install_compatibility(python_version=None):
    """Reject an unsupported cu130 target before changing its Python packages."""
    version = sys.version_info[:2] if python_version is None else python_version
    if not (3, 10) <= tuple(version) <= (3, 14):
        raise RuntimeError('The prepared CUDA stack requires Python 3.10 through 3.14; existing packages were preserved.')
    try:
        probe = subprocess.run(['nvidia-smi', '--query-gpu=driver_version,compute_cap',
                                '--format=csv,noheader'], capture_output=True, text=True, timeout=15)
        if probe.returncode or not probe.stdout.strip():
            raise ValueError()
        for line in probe.stdout.splitlines():
            driver, capability = (item.strip() for item in line.split(','))
            driver_major = int(driver.split('.')[0])
            compute = tuple(int(item) for item in capability.split('.'))
            if driver_major < MIN_DRIVER_MAJOR:
                raise RuntimeError('CUDA 13 requires NVIDIA driver 580 or newer. Update the provider/host driver first; existing packages were preserved.')
            if compute < (7, 5):
                raise RuntimeError('The prepared CUDA 13 backend requires NVIDIA compute capability 7.5 or newer; existing packages were preserved.')
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        raise RuntimeError('Cannot verify NVIDIA driver and GPU compatibility; existing packages were preserved.') from error


def acceleration_audit(torch):
    """Check the optimized execution path, separately from CUDA visibility."""
    result = {'cuda_runtime': torch.version.cuda, 'native_cuda_ready': False, 'issues': []}
    try:
        version = tuple(int(part) for part in str(torch.version.cuda).split('.')[:2])
    except (TypeError, ValueError):
        version = ()
    if version < MIN_CUDA:
        result['issues'].append('CUDA 13.0+ PyTorch is required for optimized INT8 operations; found ' + str(torch.version.cuda))
    try:
        import comfy_kitchen
        backend = comfy_kitchen.list_backends().get('cuda', {})
        result['native_cuda_ready'] = (version >= MIN_CUDA and backend.get('available', False)
                                       and not backend.get('disabled', False))
        if not backend.get('available', False) or backend.get('disabled', False):
            result['issues'].append('The optimized comfy-kitchen CUDA backend is unavailable or disabled.')
    except (ImportError, RuntimeError, OSError) as error:
        result['issues'].append('Optimized CUDA backend probe failed: ' + type(error).__name__)
    return result


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
        result['acceleration'] = acceleration_audit(torch)
        result['issues'].extend(result['acceleration']['issues'])
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
    if '--check-install' in sys.argv:
        try:
            check_install_compatibility()
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            raise SystemExit(1)
    else:
        print(json.dumps(audit()))
