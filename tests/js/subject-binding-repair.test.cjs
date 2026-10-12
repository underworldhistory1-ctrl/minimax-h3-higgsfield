const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compilePrompt,parseStructuredSections}=require('../../web/h3/prompt-compiler.js');

const references=[
 {alias:'hero',kind:'image',role:'character identity'},
 {alias:'background',kind:'image',role:'custom'},
 {alias:'friend',kind:'image',role:'character identity'},
 {alias:'costume',kind:'image',role:'wardrobe'},
];
const source='subject_definitions:\n<Subject 1> is the hero in <Picture 1>.\n<Subject 2> is the room in <Picture 2>.\n<Subject 3> is the friend in <Picture 3>.\nsummary:\n@hero meets @friend in @background wearing @costume.\nretention_analysis:\n<Subject 3>: preserve identity.\ndetailed_description:\n[Shot 1] <Subject 3> says "Keep this exact dialogue."\noverall_soundscape:\nOnly the specified dialogue.\nnon_diegetic_music:\nNone.';

test('Subject 3 uses the explicit Picture 3 binding instead of card-role numbering',()=>{
 for(const prompt_mode of ['guided','structured']){
  const result=compilePrompt({mode:'refs',prompt_mode,source_prompt:source,references});
  const sections=parseStructuredSections(result.compiled_prompt);
  assert.equal(sections.subject_definitions,parseStructuredSections(source).subject_definitions);
  assert.equal(sections.detailed_description,parseStructuredSections(source).detailed_description);
  assert.equal(result.bindings[2].subject_idx,3);
  assert.equal(result.bindings[2].picture_idx,3);
  assert.equal(result.bindings[3].tag,'<Picture 4>');
  assert.match(sections.summary,/<Subject 1> meets <Subject 3> in <Picture 2> wearing <Picture 4>/);
 }
});

test('multiline and inline definitions preserve user subject numbering',()=>{
 for(const definitions of ['<Subject 3>:\nThe friend shown in <Picture 3>.\n<Subject 1> is in <Picture 1>.\n<Subject 2> is in <Picture 2>.',
 '<Subject 3> is in <Picture 3>. <Subject 1> is in <Picture 1>. <Subject 2> is in <Picture 2>.']){
  const result=compilePrompt({mode:'refs',references,source_prompt:source.replace(parseStructuredSections(source).subject_definitions,definitions)});
  assert.equal(result.bindings[2].subject_idx,3);
  assert.equal(parseStructuredSections(result.compiled_prompt).subject_definitions,definitions);
 }
});

test('several subjects in one picture keep image aliases unambiguous',()=>{
 const result=compilePrompt({mode:'refs',references,source_prompt:source.replace('friend in <Picture 3>','friend in <Picture 1>')});
 assert.equal(result.bindings[0].tag,'<Picture 1>');
 assert.equal(result.bindings[2].tag,'<Picture 3>');
 assert.match(result.compiled_prompt,/<Subject 3> is the friend in <Picture 1>/);
});

test('subject mentions inside a definition do not start another definition block',()=>{
 const definitions='<Subject 1> is beside <Subject 2> in <Picture 1>.\n<Subject 2> is shown in <Picture 2>.\n<Subject 3>:\nThe friend standing next to <Subject 1> in <Picture 3>.';
 const result=compilePrompt({mode:'refs',references,source_prompt:source.replace(parseStructuredSections(source).subject_definitions,definitions)});
 assert.equal(result.bindings[0].subject_idx,1);
 assert.equal(result.bindings[2].subject_idx,3);
 assert.equal(parseStructuredSections(result.compiled_prompt).subject_definitions,definitions);
});

test('unattached images are still rejected and plain guided aliases retain automatic roles',()=>{
 assert.throws(()=>compilePrompt({mode:'refs',references,source_prompt:source.replace('friend in <Picture 3>','friend in <Picture 9>')}),/does not exist|must be defined/);
 const result=compilePrompt({mode:'refs',references,source_prompt:'@hero meets @friend in @background wearing @costume.'});
 assert.equal(result.bindings[2].subject_idx,2);
 assert.equal(result.bindings[3].subject_idx,3);
});
