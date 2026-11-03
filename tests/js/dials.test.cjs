const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../../web/h3/configuration'),B=require('../../web/h3/graph-builder');
const caps={dials_ready:true,dial_files:['dials/h3_motion.safetensors'],refine_ready:true,sampling_options:{samplers:['euler','res_multistep'],schedulers:['simple'],weight_dtypes:['default']}};
test('selected dials reach base and separate LoRA refinement chains',()=>{
 const s={dials:[{name:caps.dial_files[0],strength:.5,enabled:true}],enable_refine:true,loras:[{name:'Motion_Repair_V2.safetensors',enabled:true,strength:.9}]};
 const g=B.buildGraph(s,{},caps),base=g[g['2'].inputs.model[0]];assert.equal(base.class_type,'DialsApplyDial');assert.equal(base.inputs.strength,.5);
 const refine=g[g['13'].inputs.samples[0]],shift=g[refine.inputs.model[0]];assert.equal(g[shift.inputs.model[0]].class_type,'DialsApplyDial');
});
test('Dials fail before submission when runtime, file, or values are unsupported',()=>{
 const s={dials:[{name:caps.dial_files[0],strength:.5,enabled:true}]};
 assert.throws(()=>B.buildGraph(s,{},{}),/Dial/);
 for(const strength of [NaN,Infinity,21])assert.throws(()=>B.buildGraph({...s,dials:[{...s.dials[0],strength}]},{},caps),/Dial/);
 assert.throws(()=>B.buildGraph({...s,dials:[{name:'../secret',enabled:true,strength:1}]},{},caps),/Dial/);
 assert.throws(()=>C.resolve({...s,dials:Array.from({length:13},()=>s.dials[0])},caps),/12 Dials/);
});
test('Pika sampling stays exact when a separately loaded Dial steers the model',()=>{
 const name=Object.keys(C.PIKA)[0],p=C.pikaVariant(name),s={model_profile:'original',mode:'text',render_method:'native',steps:p.steps,sampling:C.pikaSampling(p),loras:[{name,enabled:true,strength:1}],dials:[{name:caps.dial_files[0],enabled:true,strength:.5}]};
 const g=B.buildGraph(s,{},caps);assert.equal(g['8'].inputs.steps,4);assert.equal(g[g['2'].inputs.model[0]].class_type,'DialsApplyDial');
});
