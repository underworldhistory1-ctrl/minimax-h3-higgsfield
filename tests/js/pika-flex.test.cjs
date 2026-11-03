const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');const {buildGraph}=require('../../web/h3/graph-builder');
const caps={sampling_options:{samplers:['euler','res_multistep'],schedulers:['simple'],weight_dtypes:['default']}};
for(const [name,p] of Object.entries(C.PIKA))test('Pika graph '+name,()=>{
 const spec={mode:p.family==='ref2va'?'refs':'text',model_profile:'original',steps:p.steps,render_method:'native',loras:[{name,enabled:true,strength:1}],sampling:{sampler_name:'euler',scheduler:'simple',cfg:1,denoise:1,shift_video:p.family==='ref2va'?12:6,shift_audio:3},references:[{kind:'image',alias:'hero'}]};
 const graph=buildGraph(spec,{hero:'hero.png'},caps);assert.equal(graph['8'].inputs.steps,p.steps);assert.equal(graph['2'].inputs.shift_video,spec.sampling.shift_video);assert.equal(graph['50'].inputs.lora_name,name);
 for(const patch of [{steps:20},{mode:spec.mode==='refs'?'text':'refs'},{enable_refine:true},{render_method:'spectrum'},{loras:[...spec.loras,{name:'style.safetensors',enabled:true}]}])assert.throws(()=>buildGraph({...spec,...patch},{hero:'hero.png'},caps),/Pika Flex/);
 assert.throws(()=>buildGraph({...spec,sampling:{...spec.sampling,shift_video:9}},{hero:'hero.png'},caps),/Pika Flex/);
});

test('leaving Pika restores sampling and valid standard steps',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('web/studio.js','utf8');
 const fields={steps:{value:'4'}},ctx={state:{sampling:{shift_video:6},pikaBefore:{sampling:{shift_video:9},steps:24}},H3Configuration:C,$:id=>fields[id],window:{},refreshes:0};
 ctx.window.H3ConfigurationUI={refresh(){ctx.refreshes++;}};ctx.H3ConfigurationUI=ctx.window.H3ConfigurationUI;vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function restorePikaSampling()'),source.indexOf('function selectedPika()')),ctx);
 ctx.restorePikaSampling();assert.equal(fields.steps.value,'24');assert.equal(ctx.state.sampling.shift_video,9);assert.equal(ctx.refreshes,1);
 ctx.state.pikaBefore={sampling:{sampler_name:'h3_turbo'},steps:6};ctx.restorePikaSampling();assert.equal(ctx.state.sampling.sampler_name,undefined);
 fields.steps.value='4';ctx.restorePikaSampling();assert.equal(fields.steps.value,'20');assert.equal(ctx.state.sampling.shift_video,12);
});
