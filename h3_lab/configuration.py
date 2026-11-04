"""Admission verifies that the submitted graph agrees with the visible configuration."""
FL = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'
REF = 'minimax_h3_ref2va_pruned_int8_convrot.safetensors'

CHARACTER_SWAP = 'h3_character_swap_pro4500_1000.safetensors'
CHARACTER_SWAPS = (CHARACTER_SWAP, 'h3_character_swap_v1.5.safetensors')
ANIME_TO_REALISM = 'Anime2Realsim__H3.safetensors'


def validate_audio_refinement(spec, capabilities):
    import math
    graph = spec.get('workflow', {})
    names = [x.get('name', '') for x in spec.get('loras', []) if isinstance(x, dict) and x.get('enabled')]
    names += [node.get('inputs', {}).get('lora_name', '') for node in graph.values() if isinstance(node, dict)]
    if any(isinstance(name, str) and name.replace('\\', '/').lower().startswith('qwen21/') for name in names):
        raise ValueError('Qwen Image adapters belong in Create Image, not H3 video')
    options = spec.get('audio_refinement') or {}
    if not isinstance(options, dict) or set(options) - {'enabled', 'steps', 'denoise', 'sampler_name', 'scheduler'}:
        raise ValueError('Invalid audio enhancement declaration')
    if 'enabled' in options and type(options['enabled']) is not bool:
        raise ValueError('Audio enhancement enabled must be boolean')
    masks = [(key, node) for key, node in graph.items() if node.get('class_type') == 'H3StudioAudioRefineMask']
    restores = [(key, node) for key, node in graph.items() if node.get('class_type') == 'H3StudioAudioRestoreVideo']
    if not options.get('enabled') or spec.get('preserve_reference_audio'):
        if masks or restores:
            raise ValueError('Audio enhancement conflicts with disabled enhancement or preserved source audio')
        return None
    if not capabilities.get('audio_refine_ready') or len(masks) != 1 or len(restores) != 1:
        raise ValueError('Audio enhancement runtime is unavailable or its graph is incomplete')
    values = {'steps': 6, 'denoise': .5, 'sampler_name': 'euler', 'scheduler': 'simple', **options}
    if type(values['steps']) is not int or not 1 <= values['steps'] <= 20 or type(values['denoise']) not in (float, int) or not math.isfinite(values['denoise']) or not .01 <= values['denoise'] <= 1:
        raise ValueError('Invalid audio enhancement steps/denoise')
    mask_id, mask = masks[0]; restore_id, restore = restores[0]
    original = mask.get('inputs', {}).get('latent')
    preserve = (spec.get('continuation') or {}).get('context_length', 39) if spec.get('continuation') else 0
    if not isinstance(original, list) or len(original) != 2 or original[1] != 0 or graph.get(original[0], {}).get('class_type') != 'KSampler':
        raise ValueError('Audio enhancement must follow a completed sampling pass')
    if mask.get('inputs') != {'latent': original, 'preserve_frames': preserve}:
        raise ValueError('Audio enhancement continuation preservation disagrees')
    link = restore.get('inputs', {}).get('refined')
    if not isinstance(link, list) or len(link) != 2 or link[1] != 0 or link[0] == original[0]:
        raise ValueError('Audio enhancement sampler link is invalid')
    sampler_id = link[0]
    sampler = graph.get(sampler_id, {})
    from .render_values import seed_value
    expected = {'model': ['2', 0], 'positive': graph['8']['inputs']['positive'], 'negative': graph['8']['inputs']['negative'],
        'latent_image': [mask_id, 0], 'seed': (seed_value(graph['8']['inputs']['seed']) + 2) % (2**64),
        'steps': values['steps'], 'cfg': 1, 'sampler_name': values['sampler_name'], 'scheduler': values['scheduler'], 'denoise': values['denoise']}
    actual = dict(sampler.get('inputs', {}))
    if 'seed' in actual: actual['seed'] = seed_value(actual['seed'])
    if sampler.get('class_type') != 'KSampler' or actual != expected:
        raise ValueError('Audio enhancement settings/model/conditioning disagree')
    if restore.get('inputs') != {'source': original, 'refined': link, 'preserve_frames': preserve} or graph.get('13', {}).get('inputs', {}).get('samples') != [restore_id, 0]:
        raise ValueError('Audio enhancement must restore exact video before release/decode')
    if original[0] != '8' and not (spec.get('enable_refine') or spec.get('refine')):
        raise ValueError('Unexpected image refinement before audio enhancement')
    if spec.get('enable_refine') or spec.get('refine'):
        image_samplers = [key for key, node in graph.items() if key not in ('8', sampler_id) and node.get('class_type') == 'KSampler']
        if len(image_samplers) != 1 or original != [image_samplers[0], 0]:
            raise ValueError('Audio enhancement must follow the final image refinement sampler')
    for node_id in ('9', '10'):
        if graph.get(node_id, {}).get('inputs', {}).get('samples') != ['13', 0]:
            raise ValueError('Both decoders must receive the protected AV output')
    return sampler_id


def _validate_ref2va_adapter(spec, filename, label, replacement_image):
    graph = spec.get('workflow', {})
    def matches(name):
        return isinstance(name, str) and name.replace('\\', '/').rsplit('/', 1)[-1].lower() == filename.lower()
    declared = any(x.get('enabled') and matches(x.get('name')) for x in spec.get('loras', []) if isinstance(x, dict))
    loaded = [n for n in graph.values() if matches(n.get('inputs', {}).get('lora_name'))]
    if not declared and not loaded:
        return
    if declared != bool(loaded):
        raise ValueError(label + ' selection disagrees with the submitted LoRA graph')
    if spec.get('mode') != 'refs':
        raise ValueError(label + ' requires Ref2VA reference conditioning')
    profile = spec.get('model_profile', 'original')
    loader = graph.get('1', {})
    expected = spec.get('checkpoint') if profile == 'singularity' else FL if profile in ('hybrid_conditioning', 'hybrid_loader') else REF
    loader_type = 'MinimaxH3_HybridLoader' if profile == 'hybrid_loader' else 'UNETLoader'
    model_name = loader.get('inputs', {}).get('base_model' if profile == 'hybrid_loader' else 'unet_name')
    if loader.get('class_type') != loader_type or model_name != expected or graph.get('6', {}).get('class_type') != 'MiniMaxH3ReferenceToVideo':
        raise ValueError(label + ' requires the selected loader and Ref2VA conditioning')
    def model_chain(link):
        chain = []
        seen = set()
        while isinstance(link, list) and len(link) == 2 and link[0] in graph:
            key = link[0]
            if key in seen:
                raise ValueError(label + ' model chain contains a cycle')
            seen.add(key)
            node = graph[key]
            chain.append(node)
            if node.get('class_type') in ('UNETLoader', 'MinimaxH3_HybridLoader'):
                if key != '1':
                    raise ValueError(label + ' model chain requires the selected checkpoint loader')
                return chain
            link = node.get('inputs', {}).get('model')
        raise ValueError(label + ' model chain is not connected to the selected checkpoint loader')
    generation_chain = model_chain(graph.get('8', {}).get('inputs', {}).get('model'))
    if not any(n is adapter for n in generation_chain for adapter in loaded):
        raise ValueError(label + ' is not connected to the generation sampler')
    declarations = [x for x in spec.get('loras', []) if isinstance(x, dict) and x.get('enabled') and matches(x.get('name'))]
    if len(declarations) != 1:
        raise ValueError(label + ' must be declared exactly once')
    for adapter in loaded:
        if adapter.get('class_type') != 'LoraLoaderModelOnly':
            raise ValueError(label + ' requires the model-only LoRA loader')
        model_chain(adapter.get('inputs', {}).get('model'))
        consumed = False
        for key, sampler in graph.items():
            if sampler.get('class_type') != 'KSampler':
                continue
            chain = model_chain(sampler.get('inputs', {}).get('model'))
            if not any(node is adapter for node in chain):
                continue
            consumed = True
            strength = declarations[0].get('strength', 1)
            latent_link = sampler.get('inputs', {}).get('latent_image', [])
            audio_pass = isinstance(latent_link, list) and len(latent_link) == 2 and graph.get(latent_link[0], {}).get('class_type') == 'H3StudioAudioRefineMask'
            if key != '8' and not audio_pass:
                strength = declarations[0].get('refinement_strength', strength)
            if adapter.get('inputs', {}).get('strength_model') != strength:
                raise ValueError(label + ' strength disagrees with the selected sampler pass')
        if not consumed:
            raise ValueError(label + ' adapter is not consumed by a sampler')
    conditioning = graph['6'].get('inputs', {})
    for prefix in (('ref_images.ref_image_', 'ref_videos.ref_video_') if replacement_image else ('ref_videos.ref_video_',)):
        if not any(k.startswith(prefix) and isinstance(v, list) and len(v) == 2 and v[0] in graph for k, v in conditioning.items()):
            raise ValueError(label + ' requires connected source media')
    refs = spec.get('references', [])
    if not isinstance(refs, list) or not any(isinstance(r, dict) and r.get('kind') == 'video' for r in refs) or (replacement_image and not any(isinstance(r, dict) and r.get('kind') == 'image' for r in refs)):
        raise ValueError(label + (' requires a source video and replacement character image' if replacement_image else ' requires a source video in References'))


def validate_character_swap(spec):
    names = [x.get('name', '') for x in spec.get('loras', []) if isinstance(x, dict) and x.get('enabled')]
    names += [x.get('inputs', {}).get('lora_name', '') for x in spec.get('workflow', {}).values()]
    versions = {name.replace('\\', '/').rsplit('/', 1)[-1].lower() for name in names if isinstance(name, str)}.intersection(CHARACTER_SWAPS)
    if len(versions) > 1:
        raise ValueError('Choose one Character Swap version')
    for filename in CHARACTER_SWAPS:
        _validate_ref2va_adapter(spec, filename, 'Character Swap', True)

def validate_anime_to_realism(spec):
    _validate_ref2va_adapter(spec, ANIME_TO_REALISM, 'Anime → Realism', False)

PIKA = {f"pika_h3_flex_turbo_{steps}step{'_hd' if steps == 8 else ''}_{family}.safetensors": (steps, family)
        for steps in (4, 8) for family in ('fl2va', 'ref2va')}
PIKA.update({f'pika_h3_flex_turbo_4step_{family}_lite_r32.safetensors': (4, family) for family in ('fl2va', 'ref2va')})
PIKA['pika_h3_flex_turbo_2step_draft_ref2va.safetensors'] = (2, 'ref2va')


def _before_dials(graph, link):
    seen=set()
    while isinstance(link,list) and len(link)==2 and isinstance(link[0],str) and graph.get(link[0],{}).get('class_type')=='DialsApplyDial':
        if link[0] in seen or link[1]!=0: raise ValueError('Invalid Dial model chain')
        seen.add(link[0]);link=graph[link[0]].get('inputs',{}).get('model')
    return link


def validate_pika(spec):
    graph = spec.get('workflow', {})
    nodes = [(key, n) for key, n in graph.items() if n.get('inputs', {}).get('lora_name') in PIKA]
    active = [l for l in spec.get('loras', []) if l.get('enabled')]
    selected = [l for l in active if l.get('name') in PIKA]
    if not nodes and not selected:
        return False
    if len(nodes) != 1 or len(selected) != 1 or len(active) != 1 or 'model_profile' not in spec:
        raise ValueError('Pika Flex requires one explicit adapter and configuration contract')
    key, node = nodes[0]; lora = selected[0]; name = lora['name']; steps, family = PIKA[name]
    supported_profile = spec['model_profile'] == 'original' or (spec['model_profile'] == 'singularity' and spec.get('mode') == 'refs' and str(spec.get('checkpoint', '')).replace('\\', '/').rsplit('/', 1)[-1] == 'Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors')
    if not supported_profile or spec.get('render_method', 'native') != 'native' or family != ('ref2va' if spec.get('mode') == 'refs' else 'fl2va'):
        raise ValueError('Pika Flex requires Original or supported Singularity v2 References and its matching transformer')
    if lora.get('strength', 1) != 1 or node.get('class_type') != 'LoraLoaderModelOnly' or node.get('inputs') != {'model': ['1', 0], 'lora_name': name, 'strength_model': 1}:
        raise ValueError('Pika Flex adapter wiring or strength disagrees')
    if any(spec.get(k) for k in ('enable_refine', 'refine', 'continuation')) or (spec.get('control') or {}).get('enabled') or (spec.get('audio_refinement') or {}).get('enabled'):
        raise ValueError('Pika Flex requires a single pass without additional processing')
    if sum(n.get('class_type') == 'LoraLoaderModelOnly' for n in graph.values()) != 1 or sum('sampler' in n.get('class_type', '').lower() for n in graph.values()) != 1:
        raise ValueError('Pika Flex requires one adapter and one sampler')
    if _before_dials(graph,graph.get('2', {}).get('inputs', {}).get('model')) != [key, 0] or graph.get('8', {}).get('inputs', {}).get('model') != ['2', 0]:
        raise ValueError('Pika Flex model path disagrees')
    if graph.get('13', {}).get('inputs', {}).get('samples') != ['8', 0] or any(graph.get(key, {}).get('inputs', {}).get('samples') != ['13', 0] for key in ('9', '10')):
        raise ValueError('Pika Flex decode must follow the approved single sampler')
    required = {'sampler_name': 'euler', 'scheduler': 'simple', 'cfg': 1, 'denoise': 1, 'shift_video': 12 if family == 'ref2va' else 6, 'shift_audio': 3}
    if spec.get('steps') != steps or graph.get('8', {}).get('inputs', {}).get('steps') != steps:
        raise ValueError('Pika Flex requires the matching 2, 4 or 8 step count')
    for field, value in required.items():
        target = '2' if field.startswith('shift_') else '8'
        if (spec.get('sampling') or {}).get(field) != value or graph.get(target, {}).get('inputs', {}).get(field) != value:
            raise ValueError('Pika Flex sampling disagrees: ' + field)
    return True


def _validate_execution_path(spec, graph, audio_sampler, capabilities):
    """Validate connected execution, rather than merely the presence of optional nodes."""
    from .render_values import seed_value
    from .execution_inputs import validate_input_paths
    validate_input_paths(spec, graph, capabilities)
    def node(key, klass=None):
        value=graph.get(key, {})
        if not isinstance(value.get('inputs'), dict) or klass and value.get('class_type') != klass:
            raise ValueError('Incomplete configuration graph: ' + key)
        return value['inputs']
    def chain(link, field):
        result=[];seen=set()
        while isinstance(link,list) and len(link)==2 and isinstance(link[0],str) and link[0] in graph:
            key=link[0]
            expected_slot=1 if field=='audio' and graph[key].get('class_type')=='H3LabTrimAV' else 0
            if type(link[1]) is not int or link[1]!=expected_slot: raise ValueError('Invalid configuration output slot')
            if key in seen: raise ValueError('Configuration graph contains a cycle')
            seen.add(key);result.append(key);link=node(key).get(field)
        return result
    def linked(value, slot=0):
        if not isinstance(value,list) or len(value)!=2 or not isinstance(value[0],str) or value[0] not in graph or type(value[1]) is not int or value[1]!=slot:
            raise ValueError('Invalid configuration graph link')
        return value[0]
    # Modern graphs have one well-defined release/decode/assembly output path.
    if node('12','H3SaveVideo').get('video') != ['11',0]: raise ValueError('Saved output disagrees with video assembly')
    node('11','CreateVideo');node('13','H3ReleaseForDecode')
    for key,klass in [('9','VAEDecode'),('10','VAEDecodeAudio')]:
        if node(key,klass).get('samples') != ['13',0]: raise ValueError('Decoders must consume the final selected pass')
    image_path=chain(node('11').get('images'),'image')
    # Continuation trim has an images input rather than image.
    if '9' not in image_path:
        trim=next((key for key in image_path if graph[key].get('class_type')=='H3LabTrimAV'),None)
        if not trim or node(trim).get('images') != ['9',0]: raise ValueError('Video assembly bypasses the selected decoder')
    if not spec.get('preserve_reference_audio'):
        audio_path=chain(node('11').get('audio'),'audio')
        if '10' not in audio_path: raise ValueError('Video assembly bypasses generated audio')
    base=node('8','KSampler');conditioning=node('6')
    declarations=spec.get('loras') or []
    if not isinstance(declarations,list) or any(not isinstance(l,dict) or not isinstance(l.get('name'),str) or not l['name'] for l in declarations):
        raise ValueError('LoRA declarations require a name')
    import math
    for lora in declarations:
        for field in ('strength','refinement_strength'):
            if field in lora and (type(lora[field]) not in (int,float) or not math.isfinite(lora[field]) or not 0<=lora[field]<=2): raise ValueError('Invalid LoRA strength')
        if lora.get('enabled'):
            import re
            fl=bool(re.search(r'fl2v|t2v',lora['name'],re.I));ref=bool(re.search(r'ref2v|r2v',lora['name'],re.I))
            if (spec.get('mode')=='refs' and fl and not ref) or (spec.get('mode')!='refs' and ref and not fl):raise ValueError('LoRA is unsupported in the selected input mode/family')
    positive=chain(base.get('positive'),'positive')
    guides=spec.get('guides') or []
    if len(positive)!=len(guides)+1 or not positive or positive[-1]!='6' or any(graph[key].get('class_type')!='MiniMaxH3AddGuide' for key in positive[:-1]): raise ValueError('Selected temporal guides/conditioning disagree')
    for key, guide in zip(reversed(positive[:-1]), guides):
        values = node(key)
        frame = guide.get('frame_idx')
        if type(frame) is not int:
            raise ValueError('Temporal guide frame index must be an integer')
        if guide.get('relative_to_new_content') and spec.get('continuation'):
            frame += spec['continuation'].get('context_length', 39)
        length = conditioning.get('length')
        if type(length) is not int or not 0 <= frame < length:
            raise ValueError('Temporal guide is outside the selected timeline')
        if values.get('frame_idx') != frame or values.get('latent') != ['6', 1]:
            raise ValueError('Selected temporal guide timing/latent disagrees')
        kind = guide.get('kind', 'image')
        if kind == 'audio':
            media=node(linked(values.get('audio')), 'LoadAudio')
            if guide.get('filename') and media.get('audio')!=guide['filename']:raise ValueError('Selected audio guide source disagrees')
            if 'image' in values or values.get('audio_vae') != ['5', 0]:
                raise ValueError('Selected audio guide disagrees')
        elif kind == 'image':
            media=node(linked(values.get('image')), 'LoadImage')
            if guide.get('filename') and media.get('image')!=guide['filename']:raise ValueError('Selected image guide source disagrees')
            if 'audio' in values or values.get('vae') != ['4', 0]:
                raise ValueError('Selected image guide disagrees')
        elif kind == 'video':
            split_id = linked(values.get('image'))
            split = node(split_id, 'GetVideoComponents')
            media=node(linked(split.get('video')), 'LoadVideo')
            if guide.get('filename') and media.get('file')!=guide['filename']:raise ValueError('Selected video guide source disagrees')
            if values.get('vae') != ['4', 0] or bool(guide.get('use_audio')) != ('audio' in values):
                raise ValueError('Selected video guide disagrees')
            if guide.get('use_audio') and (values.get('audio') != [split_id, 1] or values.get('audio_vae') != ['5', 0]):
                raise ValueError('Selected video guide audio disagrees')
        else:
            raise ValueError('Unknown temporal guide kind')
    if spec.get('mode') == 'refs' and conditioning.get('ref_image_size') != (spec.get('ref_image_size') or 'match'):
        raise ValueError('Selected reference detail disagrees')
    if node('11').get('fps') != spec.get('fps', 24):
        raise ValueError('Selected video frame rate disagrees')
    # The connected decoder alone does not prove the selected output size.
    width, height = spec.get('width', 1280), spec.get('height', 704)
    exact1080 = (width, height) in ((1920, 1080), (1080, 1920))
    sampling_width = (width + 31)//32*32 if exact1080 else width
    sampling_height = (height + 31)//32*32 if exact1080 else height
    output_link = node('11').get('images')
    if exact1080:
        crop = node(linked(output_link), 'ImageCrop')
        expected = {'width': width, 'height': height, 'x': (sampling_width-width)/2, 'y': (sampling_height-height)/2}
        if any(crop.get(field) != value for field, value in expected.items()):
            raise ValueError('Selected output crop disagrees')
        output_link = crop.get('image')
    if (spec.get('enable_refine') or spec.get('refine')) and (exact1080 or (width, height) == (1664, 928)):
        scale = node(linked(output_link), 'ImageScale')
        expected = {'width': sampling_width, 'height': sampling_height, 'upscale_method': 'lanczos', 'crop': 'center'}
        if any(scale.get(field) != value for field, value in expected.items()):
            raise ValueError('Selected refinement output scale disagrees')
        output_link = scale.get('image')
    if spec.get('continuation'):
        output_link = node(linked(output_link), 'H3LabTrimAV').get('images')
    if output_link != ['9', 0]:
        raise ValueError('Selected output transform path disagrees')
    if base.get('negative')!=['7',0] or node('7','ConditioningZeroOut').get('conditioning')!=['6',0]: raise ValueError('Negative conditioning disagrees')
    if spec.get('continuation'):
        kind='MiniMaxH3GeneratedAVMaskedContext' if spec['continuation'].get('type')=='generated' else 'MiniMaxH3ExistingVideoMaskedContext'
        if node(linked(base.get('latent_image')),kind).get('latent')!=['6',1]: raise ValueError('Continuation latent path disagrees')
    elif base.get('latent_image')!=['6',1]: raise ValueError('Base latent conditioning disagrees')
    for field in ('width','height'):
        if field in spec:
            selected=spec[field]
            if (spec.get('width'),spec.get('height')) in ((1920,1080),(1080,1920)): selected=(selected+31)//32*32
            if conditioning.get(field)!=selected: raise ValueError('Submitted canvas disagrees: '+field)
    if 'target_frames' in spec and conditioning.get('length')!=spec['target_frames']: raise ValueError('Submitted duration disagrees')
    if 'compiled_prompt' in spec and conditioning.get('prompt')!=spec['compiled_prompt']: raise ValueError('Submitted prompt disagrees')
    if 'seed' in spec and seed_value(base.get('seed'))!=seed_value(spec['seed']): raise ValueError('Submitted seed disagrees')
    models=chain(base.get('model'),'model')
    if not models or models[-1]!='1' or '2' not in models: raise ValueError('Sampling bypasses the selected checkpoint/sigma path')
    method=spec.get('render_method','native')
    expected_patch={'spectrum':'SpectrumApplyMiniMaxH3','motioncache':'MiniMaxH3MotionCache'}.get(method)
    if expected_patch and not any(graph[key].get('class_type')==expected_patch for key in models): raise ValueError('Sampling bypasses the selected acceleration')
    declared=[l for l in declarations if l.get('enabled')]
    def check_model_layers(path):
        adapter_count=1 if method in ('turbo','turbo_ref') else len(declared)
        adapter_class='MiniMaxH3TurboLoRA' if method=='turbo' else 'LoraLoaderModelOnly'
        expected=[graph['1']['class_type']]+[adapter_class]*adapter_count+['DialsApplyDial']*len([d for d in spec.get('dials',[]) if d.get('enabled')])+['MiniMaxH3SigmaShift']
        if (spec.get('control') or {}).get('enabled'):expected.append('MiniMaxH3FunControlNetApply')
        if expected_patch:expected.append(expected_patch)
        if [graph[k].get('class_type') for k in reversed(path)]!=expected:raise ValueError('Selected model layers/order disagree')
        acceleration_defaults={
            'SpectrumApplyMiniMaxH3':{'enabled':True,'blend_weight':.5,'degree':1,'ridge_lambda':.1,'window_size':2,'flex_window':.75,'warmup_steps':1,'tail_actual_steps':1,'max_history':2,'debug':False,'history_storage':'system_ram','offline_archive_storage':'system_ram','audio_blend_weight':0,'offline_smoothing_replay':False},
            'MiniMaxH3MotionCache':{'reuse_threshold':.15,'motion_strength':1,'warmup_steps':4,'max_consecutive_skips':2,'start_percent':.15,'end_percent':.95,'subsample_factor':8,'verbose':False}}
        if expected_patch:
            patch=next(node(k) for k in path if graph[k].get('class_type')==expected_patch)
            selected={**acceleration_defaults[expected_patch],**(spec.get('node_options') or {}).get(expected_patch,{})}
            if {k:v for k,v in patch.items() if k!='model'}!=selected:raise ValueError('Selected acceleration widget settings disagree')
    check_model_layers(models)
    consumed_dials=set()
    def check_dials(path):
        actual=[]
        for key in reversed(path):
            if graph[key].get('class_type')!='DialsApplyDial': continue
            values=node(key);load_id=linked(values.get('dial'));load=node(load_id,'DialsLoadDial')
            if set(values)!={'model','dial','strength'} or set(load)!={'dial_name'}: raise ValueError('Invalid Dial graph inputs')
            consumed_dials.update((key,load_id));actual.append((load['dial_name'],values['strength']))
        expected=[(d['name'],d['strength']) for d in spec.get('dials',[]) if d.get('enabled')]
        if actual!=expected: raise ValueError('Connected Dials disagree with the selected pass')
    check_dials(models)
    def check_loras(path, refinement=False):
        actual=[node(key) for key in reversed(path) if graph[key].get('class_type')=='LoraLoaderModelOnly']
        if method=='turbo_ref': return  # Managed adapter is validated separately below.
        expected=[(l['name'],l.get('refinement_strength',.25 if 'motion_repair_v2' in l['name'].lower() else l.get('strength',1)) if refinement else l.get('strength',1)) for l in declared]
        if [(l.get('lora_name'),l.get('strength_model')) for l in actual]!=expected: raise ValueError('Connected LoRA chain disagrees with the selected pass')
    check_loras(models)
    refine=bool(spec.get('enable_refine') or spec.get('refine'))
    refiners=[key for key,n in graph.items() if n.get('class_type')=='KSampler' and key not in ('8',audio_sampler)]
    if len(refiners)!=(1 if refine else 0): raise ValueError('Selected refinement pass disagrees with graph')
    final=['8',0]
    if refine:
        key=refiners[0];values=node(key);final=[key,0]
        path=chain(values.get('model'),'model');check_loras(path,True)
        check_model_layers(path)
        check_dials(path)
        if not path or path[-1]!='1' or not any(graph[k].get('class_type')=='MiniMaxH3SigmaShift' for k in path): raise ValueError('Refinement bypasses the selected checkpoint/sigma path')
        if expected_patch and not any(graph[k].get('class_type')==expected_patch for k in path): raise ValueError('Refinement bypasses the selected acceleration')
        for shift in (node(k) for k in path if graph[k].get('class_type')=='MiniMaxH3SigmaShift'):
            if any(shift.get(field)!=node('2').get(field) for field in ('shift_video','shift_audio')): raise ValueError('Refinement sigma shifts disagree')
        concat=node(linked(values.get('latent_image')),'LTXVConcatAVLatent')
        upscale=node(linked(concat.get('video_latent')),'MinimaxH3LatentUpscaler3D')
        expected_upscale={'model_name':'minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors','mode':'scale by multiplier','mode.scale':spec.get('refine_scale',1.25),'align':32,'enable_temporal_chunking':True,'force_unload':True,'device':'cuda','precision':'fp16'}
        if any(upscale.get(k)!=v for k,v in expected_upscale.items()):raise ValueError('Selected refinement upscaler disagrees')
        if values.get('positive')!=base.get('positive') or values.get('negative')!=base.get('negative') or seed_value(values.get('seed'))!=(seed_value(base.get('seed'))+1)%(2**64):raise ValueError('Refinement seed/conditioning disagree with the base pass')
        separate_id=linked(upscale.get('latent'))
        if node(separate_id,'LTXVSeparateAVLatent').get('av_latent')!=['8',0] or concat.get('audio_latent')!=[separate_id,1]: raise ValueError('Refinement does not consume the base AV pass')
    if not audio_sampler and node('13').get('samples')!=final: raise ValueError('Selected final pass is bypassed before decode')
    if {key for key,n in graph.items() if n.get('class_type') in ('DialsApplyDial','DialsLoadDial')}!=consumed_dials: raise ValueError('Unconnected Dial nodes are not allowed')


def validate_configuration(spec, capabilities):
    graph=spec.get('workflow',{})
    if not isinstance(graph,dict) or any(not isinstance(n,dict) or not isinstance(n.get('inputs',{}),dict) for n in graph.values()):raise ValueError('Workflow nodes require object inputs')
    for value in spec.get('workflow',{}).values():
        if 'lora_name' in value.get('inputs',{}) and not isinstance(value['inputs']['lora_name'],str): raise ValueError('Graph adapter filenames must be strings')
    for field in ('sampling','control','audio_refinement','refinement','continuation','node_options','frames'):
        if spec.get(field) is not None and not isinstance(spec[field],dict): raise ValueError(field+' must be an object')
    for field in ('loras','references','guides','dials'):
        values=spec.get(field,[])
        if not isinstance(values,list) or any(not isinstance(value,dict) for value in values): raise ValueError(field+' must be a list of objects')
    if any(not isinstance(l.get('name'),str) or not l['name'] for l in spec.get('loras',[])): raise ValueError('LoRA declarations require a name')
    import math
    dials=[d for d in spec.get('dials',[]) if d.get('enabled')]
    if len(dials)>12: raise ValueError('At most 12 Dials can be applied')
    for dial in dials:
        if not capabilities.get('dials_ready') or dial.get('name') not in capabilities.get('dial_files',[]): raise ValueError('Selected Dial runtime or file is unavailable')
        strength=dial.get('strength')
        if type(strength) not in (int,float) or not math.isfinite(strength) or not -20<=strength<=20: raise ValueError('Invalid Dial strength')
    pika = validate_pika(spec)
    audio_sampler = validate_audio_refinement(spec, capabilities)
    validate_character_swap(spec)
    validate_anime_to_realism(spec)
    graph = spec.get('workflow', {})
    # Legacy clients have no configuration contract; ComfyUI still validates their schemas.
    if 'model_profile' not in spec and 'sampling' not in spec:
        if dials or any(n.get('class_type','').startswith('Dials') for n in graph.values()): raise ValueError('Dials require an explicit configuration contract')
        if spec.get('render_method') in ('turbo', 'turbo_ref') or any(n.get('class_type') == 'MiniMaxH3TurboLoRA' or n.get('inputs', {}).get('sampler_name') == 'h3_turbo' or 'turbo' in n.get('inputs', {}).get('lora_name','').lower() for n in graph.values()):
            raise ValueError('Turbo v4 requires an explicit configuration contract')
        return
    if (spec.get('control') or {}).get('enabled') and (spec.get('continuation') or spec.get('enable_refine') or spec.get('refine') or (spec.get('audio_refinement') or {}).get('enabled')):
        raise ValueError('ControlNet cannot be combined with refinement, continuation or audio enhancement')
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
    effective={'sampler_name':'res_multistep','scheduler':'simple','cfg':1,'denoise':1,'shift_video':12,'shift_audio':3,'weight_dtype':'default',**sampling}
    if spec.get('render_method') in ('turbo','turbo_ref'):
        effective.update(sampler_name='euler' if spec['render_method']=='turbo_ref' else 'h3_turbo',scheduler='simple',cfg=1,denoise=1,shift_video=12,shift_audio=3)
    for key, value in effective.items():
        if key == 'weight_dtype' and profile == 'hybrid_loader' and value == 'default':
            continue
        if key not in locations or graph.get(locations[key], {}).get('inputs', {}).get(key) != value:
            raise ValueError('Submitted sampling setting disagrees: ' + key)
    method = spec.get('render_method', 'native')
    if method not in ('native', 'spectrum', 'motioncache', 'turbo', 'turbo_ref'):
        raise ValueError('Unsupported render method')
    turbo_nodes = [n for n in graph.values() if n.get('class_type') == 'MiniMaxH3TurboLoRA']
    if method in ('turbo', 'turbo_ref'):
        reference_turbo = method == 'turbo_ref'
        if not capabilities.get('turbo_ref_ready' if reference_turbo else 'turbo_ready') or refs != reference_turbo or profile != 'original':
            raise ValueError('Turbo v4 requires installed nodes and Original Text or Frames')
        if any(spec.get(k) for k in ('enable_refine', 'refine', 'continuation')) or (spec.get('control') or {}).get('enabled') or (spec.get('audio_refinement') or {}).get('enabled') or any(l.get('enabled') for l in spec.get('loras', [])):
            raise ValueError('Turbo v4 supports a single pass without other adapters')
        if reference_turbo:
            turbo_nodes = [n for n in graph.values() if n.get('class_type') == 'LoraLoaderModelOnly' and n.get('inputs', {}).get('lora_name') == 'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors']
        adapter_inputs = {'model':['1',0], 'lora_name':'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors', 'strength_model':1} if reference_turbo else {'model': ['1', 0], 'lora_name': 'minimax_h3_turbo_v4_step600_ema.safetensors', 'strength': 1, 'low_vram': False}
        if len(turbo_nodes) != 1 or turbo_nodes[0].get('inputs') != adapter_inputs:
            raise ValueError('Turbo v4 adapter wiring disagrees')
        tid = next(k for k,n in graph.items() if n is turbo_nodes[0])
        if _before_dials(graph,graph.get('2', {}).get('inputs', {}).get('model')) != [tid, 0] or graph.get('8', {}).get('inputs', {}).get('model') != ['2', 0]:
            raise ValueError('Turbo v4 model path disagrees')
        required = {'sampler_name': 'euler' if reference_turbo else 'h3_turbo', 'scheduler': 'simple', 'cfg': 1, 'denoise': 1}
        if any(graph.get('8', {}).get('inputs', {}).get(k) != v for k,v in required.items()) or not 4 <= graph.get('8', {}).get('inputs', {}).get('steps', 0) <= 8:
            raise ValueError('Turbo v4 sampling disagrees')
        if reference_turbo and graph['8']['inputs']['steps'] != 8:
            raise ValueError('References Turbo requires8steps')
        if any(graph.get('2', {}).get('inputs', {}).get(k) != v for k,v in {'shift_video':12, 'shift_audio':3}.items()):
            raise ValueError('Turbo v4 sigma shifts disagree')
    elif turbo_nodes or graph.get('8', {}).get('inputs', {}).get('sampler_name') == 'h3_turbo':
        raise ValueError('Turbo adapter and sampler require the Turbo v4 render method')
    expected_patch = {'spectrum': 'SpectrumApplyMiniMaxH3', 'motioncache': 'MiniMaxH3MotionCache'}.get(method)
    patches = [n.get('class_type') for n in graph.values() if n.get('class_type') in ('SpectrumApplyMiniMaxH3', 'MiniMaxH3MotionCache')]
    if expected_patch and expected_patch not in patches or not expected_patch and patches:
        raise ValueError('Submitted acceleration disagrees with the selected method')
    if spec.get('steps') is not None and graph.get('8', {}).get('inputs', {}).get('steps') != spec['steps']:
        raise ValueError('Submitted step count disagrees with the selected settings')
    if spec.get('enable_refine') or spec.get('refine'):
        if not capabilities.get('refine_ready'):raise ValueError('Selected refinement runtime is unavailable')
        refiners = [node for key, node in graph.items() if key not in ('8', audio_sampler) and node.get('class_type') == 'KSampler']
        if len(refiners) != 1:
            raise ValueError('Refinement requires one explicit second sampler')
        refinement = spec.get('refinement') or {}
        if not isinstance(refinement, dict):
            raise ValueError('Refinement settings must be an object')
        refinement={'steps':10,'cfg':1,'denoise':.4,'sampler_name':'res_multistep','scheduler':'simple',**refinement}
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
        if spec.get('mode')!='refs' or spec.get('continuation'):raise ValueError('Source soundtrack reuse requires References without continuation')
        aliases=[i for i,ref in enumerate(videos) if ref.get('alias')==spec['preserve_reference_audio']]
        matches=aliases or [i for i,ref in enumerate(videos) if ref.get('asset_id')==spec['preserve_reference_audio']]
        slot=matches[0] if len(matches)==1 and videos[matches[0]].get('use_audio') else None
        expected_audio = graph.get('6', {}).get('inputs', {}).get(f'ref_video_audios.ref_video_audio_{slot}') if slot is not None else None
        if not expected_audio or graph.get('11', {}).get('inputs', {}).get('audio') != expected_audio:
            raise ValueError('Source soundtrack reuse disagrees with the selected reference')
    if not pika and method != 'turbo_ref' and any(node.get('class_type') == 'LoraLoaderModelOnly' and any(x in node.get('inputs', {}).get('lora_name', '').lower() for x in ('turbo', 'lightx2v')) for node in graph.values()):
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
    _validate_execution_path(spec, graph, audio_sampler, capabilities)
