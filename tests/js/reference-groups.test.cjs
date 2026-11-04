const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/prompt-compiler.js');
const ref=(alias,group,role='character identity')=>({kind:'image',alias,role,subject_group:group});
const compile=references=>C.compilePrompt({mode:'refs',source_prompt:references.map(r=>'@'+r.alias).join(' and '),references});
test('same character group maps aliases to one subject and all pictures',()=>{const r=compile([ref('front','hero'),ref('back','hero'),ref('other','villain')]);assert.deepEqual(r.bindings.map(x=>x.tag),['<Subject 1>','<Subject 1>','<Subject 2>']);const d=C.parseStructuredSections(r.compiled_prompt).subject_definitions;assert.match(d,/<Subject 1>[^\n]*<Picture 1>[^\n]*<Picture 2>/);assert.equal((d.match(/<Subject 1>/g)||[]).length,1);});
test('ungrouped cards retain independent subjects and mixed roles never join',()=>{const r=compile([ref('a'),ref('b'),ref('board',undefined,'storyboard'),ref('prop',undefined,'object')]);assert.deepEqual(r.bindings.map(x=>x.tag),['<Subject 1>','<Subject 2>','<Picture 3>','<Subject 3>']);assert.throws(()=>compile([ref('bad','hero','storyboard')]),/character group/i);assert.throws(()=>compile([ref('bad',{id:'x'})]),/character group/i);});
test('explicit native subject definitions take precedence over card groups',()=>{const r=C.compilePrompt({mode:'refs',prompt_mode:'structured',source_prompt:'subject_definitions:\n<Subject 1> in <Picture 1>.\n<Subject 2> in <Picture 2>.\n\nsummary:\n@a and @b.\n\nretention_analysis:\nKeep both.\n\ndetailed_description:\n@a meets @b.\n\noverall_soundscape:\nWind.\n\nnon_diegetic_music:\nNone.',references:[ref('a','same'),ref('b','same')]});assert.deepEqual(r.bindings.map(x=>x.tag),['<Subject 1>','<Subject 2>']);});
test('additional instructions propagate for character, storyboard, video and audio',()=>{const refs=[{...ref('hero'),instruction:'Keep the scar.'},{...ref('board',undefined,'storyboard'),panel_order:'Read top to bottom.',instruction:'Avoid borders.'},{kind:'video',alias:'move',role:'motion',instruction:'Slow down.',fps:24,frame_count:72,duration:3},{kind:'audio',alias:'voice',role:'voice',instruction:'Quiet voice.',duration:3}];const r=compile(refs);for(const text of ['Keep the scar.','Read top to bottom.','Avoid borders.','Slow down.','Quiet voice.'])assert.ok(r.compiled_prompt.includes(text));});

test('mentioning one grouped character view also connects its alternate views',()=>{const r=C.compilePrompt({mode:'refs',source_prompt:'@front walks.',references:[ref('front','hero'),ref('back','hero')]});assert.equal(r.bindings.length,2);assert.match(r.compiled_prompt,/<Picture 1> and <Picture 2>/);});

for(const role of ['location','object','visual style'])test('one mention binds every grouped '+role+' image and keeps per-view instructions',()=>{
  const r=C.compilePrompt({mode:'refs',source_prompt:'Show @front beside @other.',references:[{...ref('front','same',role),instruction:'Keep the red marking.'},{...ref('side','same',role),instruction:'Retain the wood grain.'},ref('other',undefined,role)]});
  assert.deepEqual(r.bindings.map(b=>b.tag),['<Subject 1>','<Subject 1>','<Subject 2>']);
  assert.match(r.compiled_prompt,/<Picture 1> and <Picture 2>/);
  for(const text of ['Keep the red marking.','Retain the wood grain.'])assert.ok(r.compiled_prompt.includes(text));
});

test('groups reject incompatible roles and case-insensitive duplicate names',()=>{
  assert.throws(()=>compile([ref('a','shared'),ref('b','shared','location')]),/cannot mix roles/);
  assert.throws(()=>compile([ref('Hero'),ref('hero')]),/Duplicate reference alias/);
});


test('Character Swap preset releases a former character group while retaining input guidance',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../../web/h3/configuration-ui.js'),'utf8');
  const start=source.indexOf("  $('prepareSwap').onclick=()=>{");
  const end=source.indexOf("  for(const [value,p]",start);
  const image={...ref('hero','character_hero'),instruction:'Keep the scar.',useOriginalResolution:true};
  const video={kind:'video',alias:'source',role:'motion',fps:24,frame_count:72,duration:3};
  const adapter={name:'h3_character_swap_pro4500_1000.safetensors',strength:1};
  const fields={prepareSwap:{},swapTarget:{value:'the person in red'},prompt:{value:''}};
  const state={refs:[image,video],loras:[adapter],mode:'refs'};
  const context={state,$:id=>fields[id],H3Configuration:require('../../web/h3/configuration.js'),
    selectMode:mode=>{state.mode=mode;},applyAdapterSelection:item=>{item.enabled=true;},
    renderRefs(){},renderLoras(){},refresh(){},changed(){},info(){}};
  vm.runInNewContext(source.slice(start,end),context);fields.prepareSwap.onclick();
  const result=C.compilePrompt({mode:state.mode,source_prompt:fields.prompt.value,references:state.refs});
  assert.deepEqual(result.bindings.map(x=>x.tag),['<Picture 1>','<Video 1>']);
  assert.equal(image.role,'custom');assert.ok(!image.subject_group);
  assert.equal(image.instruction,'Keep the scar.');assert.equal(image.useOriginalResolution,true);
  assert.ok(result.compiled_prompt.includes('Keep the scar.'));assert.equal(adapter.enabled,true);
});
