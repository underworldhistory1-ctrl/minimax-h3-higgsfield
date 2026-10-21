const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/image-studio.js'),'utf8');
const context={profileFiles:{int8:{unet:'qwen.safetensors',clip:'clip.safetensors'}},vaeName:'vae.safetensors'};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function qwenLora('),source.indexOf('async function uploadOne(')),context);
const base={mode:'create',profile:'int8',prompt:'A clothed adult portrait',width:512,height:512,steps:2,seed:42,referenceResolution:1024};
const adapter={lora:'qwen21/NSFW-Qwen-by-TheseAlpacas-V2.safetensors',loraStrength:0.8};
for(const mode of ['create','edit'])test(`LoRA enters ${mode} before caching and sampling`,()=>{
 const g=context.buildGraph({...base,...adapter,mode},mode==='edit'?['ref.png']:[],'test');
 assert.equal(g.lora.class_type,'LoraLoaderModelOnly');
 assert.equal(g.lora.inputs.model[0],'unet');
 assert.equal(g.lora.inputs.strength_model,0.8);
 assert.equal(mode==='edit'?g.cache.inputs.model[0]:g.sampler.inputs.model[0],'lora');
 const saved=JSON.parse(g.save.inputs.metadata_json);
 assert.equal(saved.lora,adapter.lora);assert.equal(saved.loraStrength,0.8);
});
test('no adapter preserves the original graph',()=>{
 const g=context.buildGraph(base,[],'test');assert.equal(g.lora,undefined);assert.equal(g.sampler.inputs.model[0],'unet');
});
test('unknown adapters and invalid strengths fail before submission',()=>{
 for(const strength of [NaN,Infinity,-0.1,2.1,'invalid'])assert.throws(()=>context.buildGraph({...base,...adapter,loraStrength:strength},[],'test'),/strength/);
 assert.throws(()=>context.buildGraph({...base,lora:'../other.safetensors'},[],'test'),/Unknown/);
});
test('submission receipt is not coupled to optional adapter discovery',()=>{
 const submission=source.slice(source.indexOf('async function generate('),source.indexOf('async function finishFailure('));
 assert.ok(!submission.includes('/object_info/LoraLoaderModelOnly'));
});
