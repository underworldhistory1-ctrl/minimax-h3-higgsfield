const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../../web/h3/prompt-compiler.js');
const refs=['a','b'].map(alias=>({kind:'image',alias,role:'storyboard',storyboard_group:'sequence',storyboard_mode:'continuous'}));
for(const source_prompt of ['Follow @a.','Follow <Picture1>.','integrated_multimodal_description:\n[Shot 1] Follow @a.'])test('sequence includes all ordered images from '+source_prompt,()=>{
 const result=C.compilePrompt({mode:'refs',source_prompt,references:refs});assert.deepEqual(result.bindings.map(x=>x.storyboard_index),[1,2]);
 assert.match(result.compiled_prompt,/<Picture 1> → <Picture 2>/);assert.match(result.compiled_prompt,/not a timed keyframe/);assert.match(result.compiled_prompt,/separately supplied character\/environment\/style/);
});
test('sequence reordering changes semantic order and no character numbering is consumed',()=>{
 const result=C.compilePrompt({mode:'refs',source_prompt:'@hero follows @a.',references:[refs[1],refs[0],{kind:'image',alias:'hero',role:'character identity'}]});
 assert.deepEqual(result.bindings.map(x=>[x.alias,x.tag,x.storyboard_index]),[['b','<Picture 1>',1],['a','<Picture 2>',2],['hero','<Subject 1>',undefined]]);
});
test('malformed or mixed-mode sequences fail before graph admission',()=>{
 for(const patch of [{storyboard_mode:'cuts'},{storyboard_group:[]},{role:'location'}])assert.throws(()=>C.compilePrompt({mode:'refs',source_prompt:'@a @b',references:[refs[0],{...refs[1],...patch}]}),/storyboard sequence/i);
});
