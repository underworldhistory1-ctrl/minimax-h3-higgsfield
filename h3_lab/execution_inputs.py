"""Selected media and continuation must reach the actual native conditioning path."""


def validate_input_paths(spec, graph, capabilities):
    def inputs(key, klass=None):
        node=graph.get(key,{})
        if not isinstance(node.get('inputs'),dict) or klass and node.get('class_type')!=klass:
            raise ValueError('Invalid selected input node: '+str(key))
        return node['inputs']

    def linked(value, klass, slot=0):
        if not isinstance(value,list) or len(value)!=2 or not isinstance(value[0],str) or type(value[1]) is not int or value[1]!=slot:
            raise ValueError('Invalid selected media link')
        return inputs(value[0],klass)

    def file_matches(values, field, declaration):
        # filename is the uploaded canonical input, while file is the local name.
        if isinstance(declaration,dict) and declaration.get('filename') and values.get(field)!=declaration['filename']:
            raise ValueError('Selected media source disagrees with its uploaded file')

    conditioning=inputs('6')
    if conditioning.get('clip')!=['3',0] or conditioning.get('vae')!=['4',0]:
        raise ValueError('Selected text encoder/video VAE conditioning disagrees')
    for key,klass,expected in [('3','CLIPLoader',{'clip_name':'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors','type':'minimax'}),('4','VAELoader',{'vae_name':'minimax_h3_video_vae_fp16.safetensors'}),('5','VAELoader',{'vae_name':'minimax_h3_audio_vae_fp32.safetensors'})]:
        if inputs(key,klass)!=expected:raise ValueError('Selected core encoder/VAE disagrees')
    if inputs('9').get('vae')!=['4',0] or inputs('10').get('vae')!=['5',0]:
        raise ValueError('Selected decoder VAE disagrees')
    mode=spec.get('mode','text')
    if mode not in ('text','frames','refs'):raise ValueError('Unknown generation mode')
    for name in ('first','last'):
        declaration=(spec.get('frames') or {}).get(name)
        value=conditioning.get(name+'_frame')
        if mode=='frames' and declaration:
            file_matches(linked(value,'LoadImage'),'image',declaration)
        elif value is not None:raise ValueError('Unexpected first/last frame conditioning')
    if mode=='frames' and not any((spec.get('frames') or {}).get(k) for k in ('first','last')):
        raise ValueError('Frames mode requires a declared image')
    references=spec.get('references') or []
    expected_slots=set()
    if mode=='refs':
        if not references or len(references)>12 or any(r.get('kind') not in ('image','video','audio') for r in references):
            raise ValueError('Invalid selected references')
        if conditioning.get('audio_vae')!=['5',0]:raise ValueError('Reference audio VAE disagrees')
        for kind,prefix,limit in [('image','ref_images.ref_image_',9),('video','ref_videos.ref_video_',3),('audio','ref_audios.ref_audio_',3)]:
            selected=[r for r in references if r.get('kind')==kind]
            if len(selected)>limit:raise ValueError('Selected reference count exceeds native slots')
            for index,ref in enumerate(selected):
                slot=prefix+str(index);expected_slots.add(slot)
                if kind in ('image','audio'):
                    file_matches(linked(conditioning.get(slot),'LoadImage' if kind=='image' else 'LoadAudio'),kind,ref)
                    continue
                crop=linked(conditioning.get(slot),'ImageFromBatch')
                split_link=crop.get('image');split=linked(split_link,'GetVideoComponents')
                file_matches(linked(split.get('video'),'LoadVideo'),'file',ref)
                frames=ref.get('frame_count',ref.get('duration_frames'))
                if ref.get('fps')!=24 or type(frames) is not int or frames<5:raise ValueError('Reference video requires canonical frame metadata')
                span=5+17*((min(frames,conditioning['length'])-5)//17)
                if crop.get('batch_index')!=0 or crop.get('length')!=span:raise ValueError('Reference video span disagrees')
                if ref.get('use_audio'):
                    audio_slot='ref_video_audios.ref_video_audio_'+str(index);expected_slots.add(audio_slot)
                    audio=linked(conditioning.get(audio_slot),'TrimAudioDuration')
                    if audio!={'audio':[split_link[0],1],'start_index':0,'duration':span/24}:
                        raise ValueError('Reference soundtrack must follow the same video and selected span')
                    source=spec.get('preserve_reference_audio')
                    if source and (ref.get('alias')==source or ref.get('asset_id')==source) and span!=conditioning['length']:
                        raise ValueError('Preserved source soundtrack must cover the full output')
    actual_slots={key for key in conditioning if key.startswith(('ref_images.','ref_videos.','ref_video_audios.','ref_audios.'))}
    if actual_slots!=expected_slots:raise ValueError('Selected reference slots/order disagree')
    cont=spec.get('continuation')
    if not cont:return
    if not capabilities.get('continuation_ready') or mode=='frames':raise ValueError('Selected continuation is unavailable')
    context=cont.get('context_length',39);length=conditioning.get('length')
    if type(context) is not int or context<39 or (context-39)%51 or context>=length:
        raise ValueError('Continuation context must use a shared AV boundary shorter than the output')
    generated=cont.get('type')=='generated'
    if cont.get('type') not in ('generated','imported'):raise ValueError('Invalid continuation type')
    context_link=inputs('8').get('latent_image')
    values=linked(context_link,'MiniMaxH3GeneratedAVMaskedContext' if generated else 'MiniMaxH3ExistingVideoMaskedContext')
    feather=cont.get('audio_feather_ticks',8)
    if type(feather) is not int or feather<0:raise ValueError('Invalid continuation audio feather')
    if any(values.get(k)!=v for k,v in {'latent':['6',1],'context_length':context,'audio_feather_ticks':feather}.items()):
        raise ValueError('Continuation context settings disagree')
    if generated:
        loader=inputs('1');model=loader.get('unet_name',loader.get('base_model'))
        expected={'token':cont.get('source_token'),'model_id':model,'width':conditioning['width'],'height':conditioning['height'],'fps':24}
        if not cont.get('source_token') or linked(values.get('source_latent'),'H3LabLoadContext')!=expected:
            raise ValueError('Continuation source identity/model/canvas disagrees')
        if cont.get('source_model') and cont['source_model']!=model:raise ValueError('Continuation checkpoint requires re-encoding')
    else:
        split_link=values.get('source_frames');split=linked(split_link,'GetVideoComponents')
        if not cont.get('source_file') or linked(split.get('video'),'LoadVideo')!={'file':cont['source_file']}:
            raise ValueError('Continuation source video disagrees')
        if any(values.get(k)!=v for k,v in {'source_audio':[split_link[0],1],'vae':['4',0],'audio_vae':['5',0],'source_fps':24,'crop':'disabled'}.items()):
            raise ValueError('Continuation source AV conditioning disagrees')
    trims=[(key,n.get('inputs')) for key,n in graph.items() if n.get('class_type')=='H3LabTrimAV']
    expected={'images':['9',0],'audio':['10',0],'trim_frames':[context_link[0],1],'fps':24}
    if len(trims)!=1 or trims[0][1]!=expected or inputs('11').get('audio')!=[trims[0][0],1]:
        raise ValueError('Continuation must trim the same protected image/audio context')
