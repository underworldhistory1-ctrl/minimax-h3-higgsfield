const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/prompt-compiler.js');
const references=[{kind:'image',alias:'plan',role:'spatial plan',instruction:'Camera tracks east; the actor runs west.'},{kind:'image',alias:'board',role:'storyboard',storyboard_mode:'continuous'},{kind:'image',alias:'hero',role:'character identity'}];
test('spatial plan and board use Picture tags without consuming a character Subject index',()=>{
 const r=C.compilePrompt({mode:'refs',source_prompt:'@hero follows @board using the layout in @plan.',references});
 assert.deepEqual(r.bindings.map(b=>b.tag),['<Picture 1>','<Picture 2>','<Subject 1>']);
 assert.match(r.compiled_prompt,/not an output frame or an aerial shot/);assert.match(r.compiled_prompt,/Camera tracks east; the actor runs west/);
 assert.match(r.compiled_prompt,/not calibrated camera or physical trajectory control/);
 assert.match(r.compiled_prompt,/one continuous take/);assert.match(r.compiled_prompt,/without cuts or transitions/);
 assert.doesNotMatch(C.parseStructuredSections(r.compiled_prompt).subject_definitions,/<Subject 2>/);
});
test('separate-shot boards do not invent a cut per panel; default follows the prompt',()=>{
 for(const storyboard_mode of ['auto','cuts']){
  const r=C.compilePrompt({mode:'refs',source_prompt:'Follow @board.',references:[{...references[1],storyboard_mode}]});
  assert.equal(r.bindings[0].storyboard_mode,storyboard_mode);
  if(storyboard_mode==='cuts')assert.match(r.compiled_prompt,/do not invent one cut per panel/);
  else assert.doesNotMatch(r.compiled_prompt,/one continuous take|do not invent one cut per panel/);
 }
});
test('invalid stored sequence and grouped plans fail visibly',()=>{
 assert.throws(()=>C.compilePrompt({mode:'refs',source_prompt:'@board',references:[{...references[1],storyboard_mode:'invented'}]}),/valid storyboard sequence/);
 assert.throws(()=>C.compilePrompt({mode:'refs',source_prompt:'@plan',references:[{...references[0],subject_group:'same'}]}),/invalid character group or reference group/);
});
test('native complete shot definitions retain authority over storyboard mode and spatial card instructions',()=>{
 const source='subject_definitions:\n<Picture 1> supplies a layout. <Picture 2> supplies a board. <Subject 1> is the person in <Picture 3>.\n\nsummary:\n@hero follows @board with @plan.\n\nretention_analysis:\nUse only the written layout.\n\ndetailed_description:\n[Shot 1] The person walks.\n[Shot 2] Cut to the doorway.\n\noverall_soundscape:\nWind.\n\nnon_diegetic_music:\nNone.';
 const r=C.compilePrompt({mode:'refs',prompt_mode:'structured',source_prompt:source,references});
 assert.match(r.compiled_prompt,/Cut to the doorway/);assert.doesNotMatch(r.compiled_prompt,/without cuts or transitions|Camera tracks east/);assert.ok(r.warnings.some(w=>w.includes('bypassed')));
});
