const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../../web/h3/configuration.js'),{buildGraph}=require('../../web/h3/graph-builder.js');
const caps={turbo_ready:true,sampling_options:{samplers:['res_multistep','h3_turbo'],schedulers:['simple'],weight_dtypes:['default']}};
test('Turbo v4 uses upstream pruned INT8 loader and adaptive audio/video sampler',()=>{
 for(const mode of ['text','frames']){
 const spec={mode,render_method:'turbo',steps:6,frames:{first:'start.png'}};
 const g=buildGraph(spec,{first:'start.png'},caps),adapter=g[g['2'].inputs.model[0]];
 assert.equal(g['1'].inputs.unet_name,C.FL);assert.equal(adapter.class_type,'MiniMaxH3TurboLoRA');
 assert.deepEqual(adapter.inputs,{model:['1',0],lora_name:C.TURBO,strength:1,low_vram:false});
 assert.equal(g['8'].inputs.sampler_name,'h3_turbo');assert.equal(g['8'].inputs.steps,6);assert.equal(g['8'].inputs.scheduler,'simple');
 assert.deepEqual(g['13'].inputs.samples,['8',0]);assert.deepEqual(g['10'].inputs.samples,['13',0]);
 if(mode==='frames')assert.deepEqual(g['6'].inputs.first_frame,['15',0]);
 }
});
test('Turbo refuses missing runtime and unsupported modes/combinations before graph creation',()=>{
 const spec={mode:'text',render_method:'turbo',steps:6};
 assert.throws(()=>buildGraph(spec,{},{}),/required/);
 for(const extra of [{mode:'refs'},{model_profile:'hybrid_conditioning'},{steps:20},{refine:true},{audio_refinement:{enabled:true}},{control:{enabled:true}},{continuation:{}},{loras:[{enabled:true,name:'Realism.safetensors',strength:1}]}])assert.throws(()=>buildGraph({...spec,...extra},{},caps));
 assert.throws(()=>buildGraph({sampling:{sampler_name:'h3_turbo'}},{},caps),/requires/);
});

test('References Turbo selects the documented Ref2VA adapter and 8-step Euler contract',()=>{
 const spec={mode:'refs',render_method:'turbo_ref',steps:8,references:[{kind:'image',alias:'hero'}]};
 const rc={...caps,turbo_ref_ready:true,sampling_options:{...caps.sampling_options,samplers:['res_multistep','h3_turbo','euler']}};
 const g=buildGraph(spec,{hero:'hero.png'},rc),adapter=g[g['2'].inputs.model[0]];
 assert.equal(g['1'].inputs.unet_name,C.REF);assert.equal(g['6'].class_type,'MiniMaxH3ReferenceToVideo');
 assert.equal(adapter.class_type,'LoraLoaderModelOnly');assert.equal(adapter.inputs.lora_name,C.TURBO_REF);assert.equal(adapter.inputs.strength_model,1);
 assert.equal(g['8'].inputs.sampler_name,'euler');assert.equal(g['8'].inputs.steps,8);assert.equal(g['2'].inputs.shift_video,12);assert.equal(g['2'].inputs.shift_audio,3);
 assert.ok(g['6'].inputs['ref_images.ref_image_0']);
 for(const extra of [{mode:'text'},{steps:6},{loras:[{enabled:true,name:'Realism',strength:1}]}])assert.throws(()=>buildGraph({...spec,...extra},{hero:'hero.png'},rc));
});
