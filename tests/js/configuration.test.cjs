const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');const {buildGraph}=require('../../web/h3/graph-builder');
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={model_catalog:[{name:singular,profiles:['singularity']},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader']}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,continuation_ready:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']}};
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
test('Turbo cannot be selected, loaded as a LoRA, or downloaded by a graph',()=>{
 assert.throws(()=>buildGraph({render_method:'turbo'}),/removed/);assert.throws(()=>buildGraph({loras:[{enabled:true,name:'x_turbo.safetensors'}]}),/removed/);
});
test('advanced accelerator widgets use live schemas and cannot overwrite MODEL links',()=>{
 const schemaCaps={...caps,node_schemas:{MiniMaxH3MotionCache:{input:{required:{reuse_threshold:['FLOAT',{min:0,max:1}],model:['MODEL']}}}}};
 const g=buildGraph({render_method:'motioncache',node_options:{MiniMaxH3MotionCache:{reuse_threshold:.08}}},{},schemaCaps);assert.equal(Object.values(g).find(n=>n.class_type==='MiniMaxH3MotionCache').inputs.reuse_threshold,.08);
 for(const options of [{reuse_threshold:2},{model:['1',0]},{invented:1}])assert.throws(()=>buildGraph({render_method:'motioncache',node_options:{MiniMaxH3MotionCache:options}},{},schemaCaps));
});
