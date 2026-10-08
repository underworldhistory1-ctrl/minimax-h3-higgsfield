"""Capabilities and Schema Inspection Service for H3 Studio Lab.

Evaluates host readiness, registered nodes, AV mask capabilities,
and FFmpeg tools, reporting actionable blocking reasons.
"""

import inspect
import os
import pathlib
import shutil


def check_capabilities(folder_paths_module=None, nodes_module=None) -> dict:
    # 1. FFmpeg tools
    ffmpeg_ok = bool(shutil.which("ffmpeg"))
    ffprobe_ok = bool(shutil.which("ffprobe"))

    # 2. Native and candidate nodes
    registered_nodes = {}
    if nodes_module and hasattr(nodes_module, "NODE_CLASS_MAPPINGS"):
        registered_nodes = nodes_module.NODE_CLASS_MAPPINGS

    required_native = [
        "UNETLoader", "MiniMaxH3SigmaShift", "CLIPLoader", "VAELoader",
        "MiniMaxH3ImageToVideo", "MiniMaxH3ReferenceToVideo",
        "ConditioningZeroOut", "KSampler", "VAEDecode", "VAEDecodeAudio",
        "CreateVideo", "H3SaveVideo", "H3ReleaseForDecode", "H3LoadSavedLatent"
    ]
    native_status = {name: (name in registered_nodes) for name in required_native}

    add_guide_ready = "MiniMaxH3AddGuide" in registered_nodes

    continuation_nodes = [
        "MiniMaxH3GeneratedAVMaskedContext",
        "MiniMaxH3ExistingVideoMaskedContext",
        "H3LabLoadContext", "H3LabTrimAV"
    ]
    continuation_status = {name: (name in registered_nodes) for name in continuation_nodes}

    # 3. Model files
    models_status = {}
    if folder_paths_module and hasattr(folder_paths_module, "get_full_path"):
        expected_models = {
            "fl2va": ("diffusion_models", "minimax_h3_fl2va_pruned_int8_convrot.safetensors", 20970379616),
            "ref2va": ("diffusion_models", "minimax_h3_ref2va_pruned_int8_convrot.safetensors", 20970379616),
            "text_encoder": ("text_encoders", "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15687142551),
            "video_vae": ("vae", "minimax_h3_video_vae_fp16.safetensors", 5207808496),
            "audio_vae": ("vae", "minimax_h3_audio_vae_fp32.safetensors", 605254808),
        }
        for key, (category, filename, expected_size) in expected_models.items():
            p = folder_paths_module.get_full_path(category, filename)
            try:
                models_status[key] = bool(p and os.path.isfile(p) and os.path.getsize(p) == expected_size)
            except OSError:
                models_status[key] = False

    # Optional paths remain independent of baseline readiness.
    from .control import CONTROL_FILE, CONTROL_SIZE
    control_nodes = ['ModelPatchLoader', 'MiniMaxH3FunControlNetApply', 'LoadVideo', 'GetVideoComponents', 'LoadImage', 'ImageToMask']
    control_missing = [f"Required ControlNet node '{name}' is not registered." for name in control_nodes if name not in registered_nodes]
    control_weight = False
    if folder_paths_module:
        try:
            path = folder_paths_module.get_full_path('model_patches', CONTROL_FILE)
            control_weight = bool(path and os.path.isfile(path) and os.path.getsize(path) == CONTROL_SIZE)
        except (OSError, AttributeError, KeyError):
            pass
    if not control_weight:
        control_missing.append('Exact ControlNet 2.0 weight is missing or incomplete.')
    native_control_schema = False
    try:
        cls = registered_nodes['MiniMaxH3FunControlNetApply']
        source = inspect.getsource(cls)
        native_control_schema = all(marker in source for marker in ('model_patch', 'control_video', 'source_video', 'mask', 'start_percent', 'end_percent', 'MiniMaxH3FunControlPatch'))
    except (KeyError, TypeError, OSError):
        pass
    if not native_control_schema:
        control_missing.append('Native ControlNet source/schema could not be verified.')
    refine_nodes = ['LTXVSeparateAVLatent', 'LTXVConcatAVLatent', 'MinimaxH3LatentUpscaler3D']
    refine_missing = [f"Required refine node '{name}' is not registered." for name in refine_nodes if name not in registered_nodes]
    for name in required_native:
        if name != 'MiniMaxH3ReferenceToVideo' and name not in registered_nodes:
            control_missing.append(f"Required generation node '{name}' is not registered.")
            refine_missing.append(f"Required generation node '{name}' is not registered.")
    refine_weight = False
    if folder_paths_module:
        try:
            path = folder_paths_module.get_full_path('latent_upscale_models', 'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors')
            if path:
                import json, struct
                with open(path, 'rb') as stream:
                    header_size = struct.unpack('<Q', stream.read(8))[0]
                    if 0 < header_size < 100_000_000:
                        header = json.loads(stream.read(header_size))
                        offsets = [v['data_offsets'][1] for k, v in header.items() if k != '__metadata__']
                        refine_weight = bool(offsets) and 8 + header_size + max(offsets) == os.path.getsize(path) == 690592672
        except (OSError, AttributeError, KeyError, ValueError, TypeError, struct.error):
            pass
    if not refine_weight:
        refine_missing.append('Exact named refine upscaler weight is missing or structurally incomplete.')
    base_fl_ready = bool(models_status) and all(models_status.get(k, False) for k in ('fl2va', 'text_encoder', 'video_vae', 'audio_vae'))
    if not base_fl_ready:
        control_missing.append('FL2VA base models are unavailable.')
        refine_missing.append('FL2VA base models are unavailable.')
    if not ffmpeg_ok or not ffprobe_ok:
        control_missing.append('FFmpeg and FFprobe are required for control media validation.')

    # 4. Actionable reasons
    missing_reasons = []
    if not ffmpeg_ok:
        missing_reasons.append("FFmpeg executable not found in PATH.")
    if not ffprobe_ok:
        missing_reasons.append("FFprobe executable not found in PATH.")
    for name, ok in native_status.items():
        if not ok:
            missing_reasons.append(f"Required native ComfyUI node '{name}' is not registered.")
    if not add_guide_ready:
        missing_reasons.append("MiniMaxH3AddGuide node is missing from ComfyUI runtime.")
    for name, ok in continuation_status.items():
        if not ok:
            missing_reasons.append(f"Continuation engine node '{name}' is not registered.")
    for name, ok in models_status.items():
        if not ok:
            missing_reasons.append(f"Required model '{name}' is missing or incomplete.")

    from .control_preprocess import preprocessor_status
    preprocessors = preprocessor_status()
    return {
        "control_preprocessors": preprocessors,
        "controlnet_ready": not control_missing,
        "controlnet_missing_reasons": control_missing,
        "controlnet": {"model_name": CONTROL_FILE, "weight_ready": control_weight, "native_schema_verified": native_control_schema},
        "refine_ready": not refine_missing,
        "refine_missing_reasons": refine_missing,
        "ffmpeg": {"ffmpeg": ffmpeg_ok, "ffprobe": ffprobe_ok},
        "native_nodes": native_status,
        "add_guide": add_guide_ready,
        "guides_ready": add_guide_ready and all(native_status.values()) and bool(models_status) and all(models_status.values()),
        "continuation_nodes": continuation_status,
        "models": models_status,
        "continuation_ready": all(continuation_status.values()) and all(native_status.values()) and bool(models_status) and all(models_status.values()),
        "ready": len(missing_reasons) == 0,
        "missing_reasons": missing_reasons,
    }
