"""Read-only discovery. Availability is never reported as GPU validation."""
import inspect
from pathlib import Path

SINGULARITY = {
    'Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors': 20967647456,
    'Minimax-h3_Singularity_ref2va_v1.3_int8.safetensors': 34004507622,
}


def reference_control_supported():
    try:
        from comfy.ldm.minimax import controlnet
        source = inspect.getsource(controlnet)
        return all(text in source for text in ('rows = torch.zeros', 'rows[img_update] = target_rows', 'layout.img_update'))
    except (ImportError, OSError, TypeError):
        return False


def discover(folder_paths, registered):
    catalog = []
    if folder_paths:
        try:
            files = folder_paths.get_filename_list('diffusion_models')
        except (KeyError, AttributeError, OSError):
            files = []
        for name in files:
            leaf = Path(name).name
            if leaf not in SINGULARITY and leaf != 'minimax_h3_fl2va_pruned_int8_convrot.safetensors':
                continue
            try:
                path = Path(folder_paths.get_full_path('diffusion_models', name))
                expected = SINGULARITY.get(leaf, 20970379616)
                from deploy.download_h3_models import valid_safetensors
                # Installed as a ComfyUI extension, deploy may not be importable as a top-level package.
            except ImportError:
                from ..deploy.download_h3_models import valid_safetensors
            except (OSError, TypeError, AttributeError):
                continue
            if not valid_safetensors(path, expected):
                continue
            profiles = ['singularity'] if leaf in SINGULARITY else ['hybrid_conditioning', 'hybrid_loader']
            catalog.append({'name': name, 'profiles': profiles, 'loader': 'UNETLoader',
                            'file_verified': 'size_and_structure', 'gpu_validated': False})
    choices = {}
    for node, key, output in [('KSampler', 'sampler_name', 'samplers'), ('KSampler', 'scheduler', 'schedulers'), ('UNETLoader', 'weight_dtype', 'weight_dtypes')]:
        try:
            field = registered[node].INPUT_TYPES()['required'][key][0]
            choices[output] = list(field)
        except (KeyError, AttributeError, TypeError):
            pass
    hybrid_ready = False
    try:
        fields = registered['MinimaxH3_HybridLoader'].INPUT_TYPES()['required']
        hybrid_ready = all(key in fields for key in ('base_model', 'overlay_model', 'overlay_preset')) and set(fields['overlay_preset'][0]) == {'none', 'block_range_adaln', 'all_adaln'}
    except (KeyError, AttributeError, TypeError):
        pass
    return {'model_catalog': catalog, 'sampling_options': choices, 'hybrid_loader_ready': hybrid_ready}
