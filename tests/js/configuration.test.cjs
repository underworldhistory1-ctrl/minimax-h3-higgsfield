const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');const {buildGraph}=require('../../web/h3/graph-builder');
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={model_catalog:[{name:singular,profiles:['singularity']},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader']}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,continuation_ready:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']}};
test('Anime → Realism defaults to Original and supports selected experimental checkpoint profiles',()=>{
 const spec={mode:'refs',loras:[{name:C.ANIME_TO_REALISM,enabled:true,strength:.8}],references:[{kind:'video',alias:'shot',fps:24,frame_count:124},{kind:'image',alias:'hero'}],sampling:{sampler_name:'euler',shift_video:9}};
 const g=buildGraph(spec,{shot:'shot.mp4',hero:'hero.png'},caps);
 assert.equal(g['1'].inputs.unet_name,C.REF);assert.equal(g['8'].inputs.sampler_name,'euler');assert.equal(g['2'].inputs.shift_video,9);
 const adapter=Object.values(g).find(n=>n.class_type==='LoraLoaderModelOnly');assert.equal(adapter.inputs.lora_name,C.ANIME_TO_REALISM);assert.equal(adapter.inputs.strength_model,.8);
 assert.ok(C.isAnimeToRealism('styles/'+C.ANIME_TO_REALISM.toUpperCase()));
 for(const model_profile of ['singularity','hybrid_conditioning','hybrid_loader'])assert.doesNotThrow(()=>buildGraph({...spec,model_profile,checkpoint:singular},{shot:'shot.mp4',hero:'hero.png'},caps));
 for(const mode of ['text','frames'])assert.throws(()=>buildGraph({...spec,mode},{},caps),/Ref2VA/);
 assert.throws(()=>buildGraph({...spec,references:[{kind:'image',alias:'hero'}]},{},caps),/source video/);
});
test('every selectable checkpoint profile constructs the correct loader in all modes',()=>{
 for(const model_profile of Object.keys(C.profiles))for(const mode of ['text','frames','refs']){
 const g=buildGraph({mode,model_profile,checkpoint:singular,frames:{first:'f'},references:[{kind:'image',alias:'hero'}]},{first:'f.png',hero:'hero.png'},caps);
 assert.equal(g['1'].class_type,model_profile==='hybrid_loader'?'MinimaxH3_HybridLoader':'UNETLoader');
 if(model_profile==='hybrid_loader'){assert.equal(g['1'].inputs.overlay_preset,'none');assert.equal(g['1'].inputs.overlay_model,'');}
 else assert.equal(g['1'].inputs.unet_name,model_profile==='singularity'?singular:model_profile==='hybrid_conditioning'?C.FL:mode==='refs'?C.REF:C.FL);
 }
});
test('sampling overrides survive resolution and arrive at their exact nodes',()=>{
 const sampling={sampler_name:'euler',scheduler:'normal',cfg:2,denoise:.8,shift_video:9,shift_audio:2,weight_dtype:'fp8_e4m3fn'};
 const g=buildGraph({sampling},{},caps);assert.equal(g['8'].inputs.sampler_name,'euler');assert.equal(g['8'].inputs.scheduler,'normal');assert.equal(g['8'].inputs.cfg,2);assert.equal(g['8'].inputs.denoise,.8);assert.equal(g['2'].inputs.shift_video,9);assert.equal(g['2'].inputs.shift_audio,2);assert.equal(g['1'].inputs.weight_dtype,'fp8_e4m3fn');
 for(const s of [{cfg:NaN},{denoise:2},{sampler_name:'invented'},{weight_dtype:'invented'}])assert.throws(()=>buildGraph({sampling:s},{},caps));
});
test('reference ControlNet requires real runtime support and keeps image identity ordering',()=>{
 const control={enabled:true,kind:'pose',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',fps:24,frame_count:124,width:1280,height:704,control_file:'pose.mp4'};
 const spec={mode:'refs',control,references:[{kind:'image',alias:'character'},{kind:'image',alias:'environment'}]};
 assert.throws(()=>buildGraph(spec,{character:'a.png',environment:'b.png'},{controlnet_ready:true}),/16020/);
 const g=buildGraph(spec,{character:'a.png',environment:'b.png'},caps);assert.equal(g['6'].class_type,'MiniMaxH3ReferenceToVideo');assert.equal(g[g['6'].inputs['ref_images.ref_image_0'][0]].inputs.image,'a.png');assert.equal(g[g['6'].inputs['ref_images.ref_image_1'][0]].inputs.image,'b.png');assert.equal(g[g['8'].inputs.model[0]].class_type,'MiniMaxH3FunControlNetApply');
});
test('Singularity and hybrid continuation context uses selected model identity',()=>{
 for(const model_profile of ['singularity','hybrid_conditioning','hybrid_loader']){
 const source_model=model_profile==='singularity'?singular:C.FL;
 const g=buildGraph({mode:'refs',model_profile,checkpoint:singular,references:[{kind:'image',alias:'hero'}],continuation:{type:'generated',source_token:'saved',source_model}},{hero:'hero.png'},caps);
 assert.equal(Object.values(g).find(n=>n.class_type==='H3LabLoadContext').inputs.model_id,source_model);
 }
});
test('source soundtrack reuse is explicit and never falls back to generated audio',()=>{
 const ref={kind:'video',alias:'source',fps:24,frame_count:124,use_audio:true};
 const g=buildGraph({mode:'refs',references:[ref],preserve_reference_audio:'source'},{source:'s.mp4'},caps);
 assert.equal(g[g['11'].inputs.audio[0]].class_type,'TrimAudioDuration');assert.equal(g[g['11'].inputs.audio[0]].inputs.duration,124/24);
 for(const bad of [{...ref,use_audio:false},{...ref,frame_count:107}])assert.throws(()=>buildGraph({mode:'refs',references:[bad],preserve_reference_audio:'source'},{source:'s.mp4'},caps));
});
test('Turbo requires current runtime and cannot be loaded as a standalone LoRA',()=>{
 assert.throws(()=>buildGraph({render_method:'turbo'}),/required/);assert.throws(()=>buildGraph({loras:[{enabled:true,name:'x_turbo.safetensors'}]}),/unsupported/);
});
test('advanced accelerator widgets use live schemas and cannot overwrite MODEL links',()=>{
 const schemaCaps={...caps,node_schemas:{MiniMaxH3MotionCache:{input:{required:{reuse_threshold:['FLOAT',{min:0,max:1}],model:['MODEL']}}}}};
 const g=buildGraph({render_method:'motioncache',node_options:{MiniMaxH3MotionCache:{reuse_threshold:.08}}},{},schemaCaps);assert.equal(Object.values(g).find(n=>n.class_type==='MiniMaxH3MotionCache').inputs.reuse_threshold,.08);
 for(const options of [{reuse_threshold:2},{model:['1',0]},{invented:1}])assert.throws(()=>buildGraph({render_method:'motioncache',node_options:{MiniMaxH3MotionCache:options}},{},schemaCaps));
});

test('Character Swap supports selected profiles and requires both reference media types',()=>{
 const spec={mode:'refs',loras:[{name:C.CHARACTER_SWAP,enabled:true,strength:1}],references:[{kind:'video',alias:'shot',fps:24,frame_count:124},{kind:'image',alias:'replacement',role:'custom'}]};
 const g=buildGraph(spec,{shot:'shot.mp4',replacement:'new.png'},caps);
 assert.equal(g['1'].inputs.unet_name,C.REF);
 const adapter=Object.values(g).find(n=>n.class_type==='LoraLoaderModelOnly');assert.equal(adapter.inputs.lora_name,C.CHARACTER_SWAP);assert.equal(adapter.inputs.strength_model,1);
 for(const model_profile of ['singularity','hybrid_conditioning','hybrid_loader'])assert.doesNotThrow(()=>buildGraph({...spec,model_profile,checkpoint:singular},{shot:'shot.mp4',replacement:'new.png'},caps));
 for(const mode of ['text','frames'])assert.throws(()=>buildGraph({...spec,mode},{},caps),/Character Swap/);
 for(const kind of ['image','video'])assert.throws(()=>buildGraph({...spec,references:spec.references.filter(r=>r.kind===kind)},{},caps),/source video/);
 assert.ok(C.isCharacterSwap('folder/'+C.CHARACTER_SWAP));
});
test('Anime plus Combat with image/video references and timed keyframes stays connected for every renderer',()=>{
 for(const model_profile of Object.keys(C.profiles))for(const render_method of ['native','motioncache','spectrum']){
 const spec={mode:'refs',model_profile,checkpoint:singular,render_method,target_frames:124,loras:[{name:C.ANIME_TO_REALISM,enabled:true,strength:.8},{name:'H3_Combat_V2.safetensors',enabled:true,strength:.6}],references:[{kind:'video',alias:'shot',fps:24,frame_count:124,use_audio:true},{kind:'image',alias:'hero'}],guides:[{kind:'image',file:'start.jpg',frame_idx:0},{kind:'image',file:'end.jpg',frame_idx:123}]};
 const g=buildGraph(spec,{shot:'shot.mp4',hero:'hero.png'},caps),l=Object.entries(g).filter(([id,n])=>n.class_type==='LoraLoaderModelOnly'),guides=Object.entries(g).filter(([id,n])=>n.class_type==='MiniMaxH3AddGuide');
 assert.equal(g['1'].class_type,model_profile==='hybrid_loader'?'MinimaxH3_HybridLoader':'UNETLoader');if(model_profile!=='hybrid_loader')assert.equal(g['1'].inputs.unet_name,model_profile==='singularity'?singular:model_profile==='hybrid_conditioning'?C.FL:C.REF);assert.equal(l.length,2);assert.deepEqual(l[1][1].inputs.model,[l[0][0],0]);assert.deepEqual(g['2'].inputs.model,[l[1][0],0]);assert.equal(guides.length,2);assert.deepEqual(guides[0][1].inputs.positive,['6',0]);assert.deepEqual(guides[1][1].inputs.positive,[guides[0][0],0]);assert.deepEqual(g['8'].inputs.positive,[guides[1][0],0]);assert.ok(g['6'].inputs['ref_images.ref_image_0']);assert.ok(g['6'].inputs['ref_videos.ref_video_0']);assert.ok(g['6'].inputs['ref_video_audios.ref_video_audio_0']);
 }
});
