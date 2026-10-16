const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../../web/h3/prompt-compiler.js');
const realism={name:'h3-realism-people-t2v-i2v-r2v.safetensors',enabled:true};
for(const mode of ['text','frames','refs'])test('required adapter trigger enters compiled '+mode+' prompt only',()=>{
 const spec={mode,source_prompt:'A cinematic scene.',target_frames:124,frames:{first:{file:'start.png'}},references:[{alias:'66',kind:'image',role:'custom',instruction:'Use only cinematic color and lighting.'}],loras:[realism]};const before=structuredClone(spec);const result=C.compilePrompt(spec);assert.match(result.compiled_prompt,/r34l1sm/);assert.deepEqual(spec,before);assert.equal((C.compilePrompt({...spec,source_prompt:result.compiled_prompt,prompt_mode:'structured'}).compiled_prompt.match(/r34l1sm/g)||[]).length,1);
});
test('disabled or triggerless adapters add nothing; subfolders and case work',()=>{assert.deepEqual(C.adapterTriggerWords([{...realism,enabled:false},{name:'H3_Combat_V2.safetensors',enabled:true}]),[]);assert.deepEqual(C.adapterTriggerWords([{name:'folder/Anime2Realsim__H3.safetensors',enabled:true},realism]),['LumiReal','r34l1sm']);});
