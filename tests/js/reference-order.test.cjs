const {test}=require('node:test');const assert=require('node:assert/strict');
const O=require('../../web/h3/reference-order.js'),C=require('../../web/h3/prompt-compiler.js');
const image=(alias,extra={})=>({kind:'image',alias,role:'character identity',...extra});
test('permutations reject duplicates, stale lengths, and invalid indices',()=>{const a={},b={};assert.deepEqual(O.permutation([a,b],[1,0]),[b,a]);for(const p of [[0,0],[0],[1,2],[0,.5]])assert.throws(()=>O.permutation([a,b],p));});
test('numeric picture, subject, paired soundtrack and standalone audio follow identity in one pass',()=>{
 const a=image('a'),b=image('b'),v={kind:'video',useAudio:true},w={kind:'video',useAudio:true},x={kind:'audio'},y={kind:'audio'};
 const before=[a,b,v,w,x,y],after=[b,a,w,v,y,x];
 assert.equal(O.remap('<Picture 1> <Picture 2> <Subject 1> <Video 1> <Audio 1> <Audio 3>',before,after),'<Picture 2> <Picture 1> <Subject 2> <Video 2> <Audio 2> <Audio 4>');
 assert.equal(O.remapQwen('<image1> and <image2>',[a,b],[b,a]),'<image2> and <image1>');
});
test('grouped automatic subjects retain identity across group moves',()=>{
 const a=image('a',{subject_group:'hero'}),b=image('b',{subject_group:'hero'}),c=image('c');
 assert.equal(O.remap('<Subject 1> <Picture 2> <Subject 2>',[a,b,c],[c,b,a]),'<Subject 2> <Picture 2> <Subject 1>');
});
test('alias-led definitions remap automatic subjects, explicit Picture or alias definitions preserve numbering',()=>{
 const a=image('a'),b=image('b'),before=[a,b],after=[b,a];
 for(const definitions of ['@a is a man.\n@b is a woman.','<Subject 1> is @a.\n<Subject 2> is @b.','<Subject 1> in <Picture 1>.\n<Subject 2> in <Picture 2>.']){
  const text='subject_definitions:\n'+definitions+'\n\nsummary:\n@a meets @b.\n\nretention_analysis:\nKeep both.\n\ndetailed_description:\n[Shot 1] <Subject 1> raises a hand.\n\noverall_soundscape:\nWind.\n\nnon_diegetic_music:\nNone.';
  const explicitSubjects=C.ownsSubjectNumbering(text,before);assert.equal(explicitSubjects,definitions.startsWith('<'));
  const moved=O.remap(text,before,after,{explicitSubjects});const result=C.compilePrompt({mode:'refs',source_prompt:moved,references:after});
  const binding=result.bindings.find(x=>x.alias==='a');assert.equal(binding.subject_idx,explicitSubjects?1:2);
  assert.match(C.parseStructuredSections(result.compiled_prompt).detailed_description,new RegExp('<Subject '+binding.subject_idx+'> raises a hand'));
 }
});
