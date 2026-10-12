const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compilePrompt,parseStructuredSections}=require('../../web/h3/prompt-compiler.js');
const source=`subject_definitions:
@constantine: IDENTITY_MARKER. Preserve identity; wardrobe follows the scene.
@storyboard: STORYBOARD_MARKER. Composition and progression only.
@bathroom_location1, @bathroom_location2, @bathroom_location3: LOCATION_MARKER. Art direction only.
summary:
SCENE_SUMMARY_MARKER. No speech.
retention_analysis:
Character comes from @constantine. Composition comes from @storyboard. Use the locations for aesthetics.
detailed_description:
[Shot 1] DESCRIPTION_MARKER. [Shot 2] CONTINUITY_MARKER.
overall_soundscape:
SOUND_MARKER. No dialogue or narration.
non_diegetic_music:
N/A`;
const references=[
 {alias:'constantine',kind:'image',role:'character identity'},
 {alias:'storyboard',kind:'image',role:'storyboard'},
 ...[1,2,3].map(i=>({alias:'bathroom_location'+i,kind:'image',role:'environment'})),
];

test('grouped location definition supports every attached alias without altering creative sections',()=>{
 for(const prompt_mode of ['guided','structured'])for(const roomRole of ['environment','custom']){
  const refs=references.map(r=>({...r,role:r.alias.startsWith('bathroom')?roomRole:r.role}));
  const result=compilePrompt({mode:'refs',prompt_mode,source_prompt:source,references:refs});
  const sections=parseStructuredSections(result.compiled_prompt),original=parseStructuredSections(source);
  for(const key of ['summary','retention_analysis','detailed_description','overall_soundscape','non_diegetic_music']){
   const resolved=original[key].replace(/@([\w]+)/g,(_,alias)=>result.bindings.find(b=>b.alias===alias).tag);
   assert.equal(sections[key],resolved,key);
  }
  for(const b of result.bindings.filter(b=>b.subject_idx)){
   assert.ok(sections.subject_definitions.includes(`${b.tag} is shown in <Picture ${b.picture_idx}>.`));
  }
  assert.ok(!result.compiled_prompt.includes('@bathroom_location'));
  assert.equal(sections.non_diegetic_music,'N/A');
 }
});

test('explicit alias-to-picture conflicts are not hidden by inferred relations',()=>{
 const refs=[{alias:'hero',kind:'image',role:'character identity'},{alias:'room',kind:'image',role:'custom'}];
 const source_prompt='subject_definitions:\n@hero is shown in <Picture 2>.\nsummary:\n@hero enters @room.';
 assert.throws(()=>compilePrompt({mode:'refs',references:refs,source_prompt}),/conflicts with its attached image binding/);
 const result=compilePrompt({mode:'refs',references:refs,source_prompt:source_prompt.replace('shown in <Picture 2>','shown in <Picture 1>')});
 assert.equal((parseStructuredSections(result.compiled_prompt).subject_definitions.match(/is shown in/g)||[]).length,1);
});
