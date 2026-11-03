const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');
const caps={turbo_ready:true,turbo_ref_ready:true};
test('paired soundtracks and standalone reference audio have separate budgets',()=>{
 const {validateLimits}=require('../../web/h3/prompt-compiler');
 const refs=[...Array.from({length:3},(_,i)=>({kind:'video',use_audio:true,duration:5})),...Array.from({length:3},()=>({kind:'audio',duration:5}))];
 assert.doesNotThrow(()=>validateLimits(refs));
 assert.throws(()=>validateLimits([...refs,{kind:'audio',duration:2}]),/audio references/);
 assert.throws(()=>validateLimits(refs.map(r=>r.kind==='audio'?{...r,duration:6}:r)),/audio.*15|15.*audio/i);
});
test('interactive mode transitions choose the matching managed workflow',()=>{
 const s=C.normalizeSelection({mode:'refs',model_profile:'original',render_method:'turbo',steps:6},'mode',caps);
 assert.equal(s.render_method,'turbo_ref');assert.equal(s.steps,8);
 assert.equal(C.normalizeSelection({...s,model_profile:'singularity'},'profile',caps).render_method,'native');
});
test('Pika selection owns its required settings without deleting attached inputs',()=>{
 const name=Object.keys(C.PIKA)[0],references=[{kind:'video',alias:'source'}];
 const s=C.normalizeSelection({mode:'text',model_profile:'singularity',render_method:'spectrum',steps:20,sampling:{cfg:8},enable_refine:true,audio_refinement:{enabled:true},control:{enabled:true},references,loras:[{name,enabled:true,strength:.3},{name:'style',enabled:true}]},'pika',caps);
 assert.equal(s.model_profile,'original');assert.equal(s.render_method,'native');assert.equal(s.steps,4);assert.equal(s.loras.filter(x=>x.enabled).length,1);assert.equal(s.loras[0].strength,1);assert.equal(s.sampling.cfg,1);assert.equal(s.enable_refine,false);assert.equal(s.control.enabled,false);assert.deepEqual(s.references,references);assert.doesNotThrow(()=>C.validatePika(s));
 assert.doesNotThrow(()=>C.validatePika(C.normalizeSelection({...s,sampling:{}},'reset',caps)));
});
test('hydration retains saved intent and exposes invalid combinations',()=>{
 const s={mode:'refs',render_method:'turbo',steps:6};assert.deepEqual(C.normalizeSelection(s,'restore',caps),s);
 assert.match(C.selectionRestrictions({control:{enabled:true}}).audio,/ControlNet/);
 assert.match(C.selectionRestrictions({continuation:{type:'generated'}}).pika,/continuation/i);
});
test('starting continuation selects the supported native workflow and retains source',()=>{
 const continuation={type:'imported',source_file:'source.mp4'};
 const s=C.normalizeSelection({render_method:'turbo',steps:6,enable_refine:true,control:{enabled:true},continuation},'continuation',caps);
 assert.equal(s.render_method,'native');assert.equal(s.steps,20);assert.equal(s.enable_refine,false);assert.equal(s.control.enabled,false);assert.deepEqual(s.continuation,continuation);
});
for(const render_method of ['spectrum','motioncache'])test('separate refinement LoRA preserves '+render_method,()=>{
 const g=require('../../web/h3/graph-builder').buildGraph({render_method,enable_refine:true,loras:[{name:'Motion_Repair_V2.safetensors',enabled:true,strength:.9}]},{},{refine_ready:true});
 const sampler=g[g['13'].inputs.samples[0]],patch=g[sampler.inputs.model[0]];
 assert.equal(patch.class_type,render_method==='spectrum'?'SpectrumApplyMiniMaxH3':'MiniMaxH3MotionCache');
});
