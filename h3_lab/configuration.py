"""Admission verifies that the submitted graph agrees with the visible configuration."""
FL = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'
REF = 'minimax_h3_ref2va_pruned_int8_convrot.safetensors'


def validate_configuration(spec, capabilities):
    graph = spec.get('workflow', {})
    # Legacy clients have no configuration contract; ComfyUI still validates their schemas.
    if 'model_profile' not in spec and 'sampling' not in spec:
        return
    profile = spec.get('model_profile', 'original')
    refs = spec.get('mode') == 'refs'
    loader = graph.get('1', {})
    inputs = loader.get('inputs', {})
    if profile == 'original':
        expected = REF if refs else FL
    elif profile in ('singularity', 'hybrid_conditioning', 'hybrid_loader'):
        expected = spec.get('checkpoint') if profile == 'singularity' else FL
        if not any(x.get('name') == expected and profile in x.get('profiles', []) for x in capabilities.get('model_catalog', [])):
            raise ValueError('Selected checkpoint is unavailable for this profile')
    else:
        raise ValueError('Unknown model profile')
    if profile == 'hybrid_loader':
        if not capabilities.get('hybrid_loader_ready') or loader.get('class_type') != 'MinimaxH3_HybridLoader':
            raise ValueError('Hybrid loader is unavailable')
        preset = spec.get('hybrid_preset', 'none')
        if inputs != {'base_model': FL, 'overlay_model': '' if preset == 'none' else REF, 'overlay_preset': preset}:
            raise ValueError('Submitted hybrid loader disagrees with the selected settings')
    elif loader.get('class_type') != 'UNETLoader' or inputs.get('unet_name') != expected:
        raise ValueError('Submitted checkpoint disagrees with the selected settings')
    if graph.get('6', {}).get('class_type') != ('MiniMaxH3ReferenceToVideo' if refs else 'MiniMaxH3ImageToVideo'):
        raise ValueError('Submitted conditioning disagrees with the selected mode')
    sampling = spec.get('sampling') or {}
    if not isinstance(sampling, dict):
        raise ValueError('Sampling settings must be an object')
    locations = {'sampler_name': '8', 'scheduler': '8', 'cfg': '8', 'denoise': '8', 'shift_video': '2', 'shift_audio': '2', 'weight_dtype': '1'}
    for key, value in sampling.items():
        if key == 'weight_dtype' and profile == 'hybrid_loader' and value == 'default':
            continue
        if key not in locations or graph.get(locations[key], {}).get('inputs', {}).get(key) != value:
            raise ValueError('Submitted sampling setting disagrees: ' + key)
    method = spec.get('render_method', 'native')
    if method not in ('native', 'spectrum', 'motioncache'):
        raise ValueError('Unsupported render method')
    expected_patch = {'spectrum': 'SpectrumApplyMiniMaxH3', 'motioncache': 'MiniMaxH3MotionCache'}.get(method)
    patches = [n.get('class_type') for n in graph.values() if n.get('class_type') in ('SpectrumApplyMiniMaxH3', 'MiniMaxH3MotionCache')]
    if expected_patch and expected_patch not in patches or not expected_patch and patches:
        raise ValueError('Submitted acceleration disagrees with the selected method')
    if spec.get('steps') is not None and graph.get('8', {}).get('inputs', {}).get('steps') != spec['steps']:
        raise ValueError('Submitted step count disagrees with the selected settings')
    if spec.get('enable_refine') or spec.get('refine'):
        refiners = [node for key, node in graph.items() if key != '8' and node.get('class_type') == 'KSampler']
        if len(refiners) != 1:
            raise ValueError('Refinement requires one explicit second sampler')
        refinement = spec.get('refinement') or {}
        if not isinstance(refinement, dict):
            raise ValueError('Refinement settings must be an object')
        for key, value in refinement.items():
            if key not in ('steps', 'cfg', 'denoise', 'sampler_name', 'scheduler') or refiners[0].get('inputs', {}).get(key) != value:
                raise ValueError('Submitted refinement settings disagree: ' + key)
        if spec.get('refine_scale') is not None:
            upscalers = [node for node in graph.values() if node.get('class_type') == 'MinimaxH3LatentUpscaler3D']
            if len(upscalers) != 1 or upscalers[0].get('inputs', {}).get('mode.scale') != spec['refine_scale']:
                raise ValueError('Submitted refinement scale disagrees')
    if spec.get('preserve_reference_audio'):
        references = spec.get('references', [])
        if not isinstance(references, list) or any(not isinstance(ref, dict) for ref in references):
            raise ValueError('References must be a list of reference objects')
        videos = [ref for ref in references if ref.get('kind') == 'video']
        slot = next((i for i, ref in enumerate(videos) if (ref.get('asset_id') or ref.get('alias')) == spec['preserve_reference_audio'] and ref.get('use_audio')), None)
        expected_audio = graph.get('6', {}).get('inputs', {}).get(f'ref_video_audios.ref_video_audio_{slot}') if slot is not None else None
        if not expected_audio or graph.get('11', {}).get('inputs', {}).get('audio') != expected_audio:
            raise ValueError('Source soundtrack reuse disagrees with the selected reference')
    if any(node.get('class_type') == 'LoraLoaderModelOnly' and any(x in node.get('inputs', {}).get('lora_name', '').lower() for x in ('turbo', 'lightx2v')) for node in graph.values()):
        raise ValueError('Turbo has been retired')
    options = spec.get('node_options') or {}
    if not isinstance(options, dict):
        raise ValueError('Accelerator settings must be an object')
    for klass, values in options.items():
        if klass not in ('SpectrumApplyMiniMaxH3', 'MiniMaxH3MotionCache') or not isinstance(values, dict):
            raise ValueError('Unknown accelerator configuration')
        selected = [n for n in graph.values() if n.get('class_type') == klass]
        # Saved inactive-method overrides remain in projects, but do not change this graph.
        if selected and any(any(n.get('inputs', {}).get(k) != v for k, v in values.items()) for n in selected):
            raise ValueError('Submitted accelerator settings disagree with the configuration')
