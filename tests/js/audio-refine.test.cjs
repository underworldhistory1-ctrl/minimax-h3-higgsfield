const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');const {buildGraph}=require('../../web/h3/graph-builder');
const caps={audio_refine_ready:true,refine_ready:true,continuation_ready:true,controlnet_ready:true,controlnet_references_ready:true,hybrid_loader_ready:true,model_catalog:[{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader']},{name:'Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors',profiles:['singularity']}],sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default']}};
test('audio-only pass across every mode/profile/method/refinement preserves loader and skips acceleration',()=>{
 for(const mode of ['text','frames','refs'])for(const model_profile of Object.keys(C.profiles))for(const render_method of ['native','motioncache','spectrum'])for(const enable_refine of [false,true]){
  const spec={mode,model_profile,checkpoint:'Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors',render_method,enable_refine,frames:{first:'first'},seed:'18446744073709551615',audio_refinement:{enabled:true,steps:8,denoise:.4,sampler_name:'euler',scheduler:'normal'},references:[{alias:'hero',kind:'image'}]};
  const g=buildGraph(spec,{hero:'hero.png',first:'first.png'},caps),restore=Object.values(g).find(n=>n.class_type==='H3StudioAudioRestoreVideo'),mask=Object.values(g).find(n=>n.class_type==='H3StudioAudioRefineMask'),sampler=g[restore.inputs.refined[0]];
  assert.deepEqual(sampler.inputs.model,['2',0]);assert.equal(sampler.inputs.seed,1);assert.equal(sampler.inputs.cfg,1);assert.equal(sampler.inputs.steps,8);assert.equal(sampler.inputs.denoise,.4);assert.equal(sampler.inputs.scheduler,'normal');assert.deepEqual(restore.inputs.source,mask.inputs.latent);assert.equal(g[mask.inputs.latent[0]].class_type,'KSampler');assert.equal(mask.inputs.preserve_frames,0);assert.equal(enable_refine,mask.inputs.latent[0]!=='8');
 }
});
test('source soundtrack bypasses audio enhancement, missing runtime and bad settings reject',()=>{
 const base={mode:'refs',references:[{kind:'video',alias:'v',use_audio:true,fps:24,frame_count:124}],audio_refinement:{enabled:true},preserve_reference_audio:'v'};
 const g=buildGraph(base,{v:'source.mp4'},caps);assert.ok(!Object.values(g).some(n=>n.class_type==='H3StudioAudioRefineMask'));
 assert.throws(()=>buildGraph({audio_refinement:{enabled:true}},{}),/runtime/);
 for(const options of [{steps:0},{steps:1.5},{denoise:0},{denoise:2}])assert.throws(()=>buildGraph({audio_refinement:{enabled:true,...options}},{},caps),/settings/);
});
test('continuation prefix is protected in both new audio nodes',()=>{
 const g=buildGraph({mode:'text',continuation:{type:'generated',source_token:'123abc456def',source_model:C.FL,source_canvas:{width:1280,height:704},context_length:39},audio_refinement:{enabled:true}}, {},caps);
 for(const n of Object.values(g))if(n.class_type.startsWith('H3StudioAudio'))assert.equal(n.inputs.preserve_frames,39);
});
