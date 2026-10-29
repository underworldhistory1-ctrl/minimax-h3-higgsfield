const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
function workspace(){
 const draft={mode:'refs',prompts:{refs:'@1 inside @2'},refs:[{assetId:'a',alias:'1'},{assetId:'b',alias:'2'}]};
 const calls=[],state={activeProjectId:'p',currentProject:{project_id:'p',draft},refs:draft.refs};
 const context={state,projectCtrl:{currentProject:state.currentProject,saveCurrentProject:async()=>calls.push('server-save')},
  allInputItems:()=>state.refs,captureProjectDraft:local=>local?{...draft,tab_view:'projects'}:draft,
  H3TabDraftStore:{save:async()=>calls.push('local-save')},tabProjectDraftKey:id=>id,
  persistProjectDraft:async()=>{calls.push('persist');return draft;},mergeProjectAssetDescriptors:()=>[],
  setWorkspaceView:view=>calls.push(view),setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(fs.readFileSync('web/h3/project-workspace.js','utf8').replace(/initWorkspaceNavigation\(\);\s*initProjectWorkspace\(\);\s*H3OrganizationUI.init\(\);\s*$/,''),context);
 context.setWorkspaceView=view=>calls.push(view);
 return {context,state,calls,draft};
}
test('unchanged navigation preserves local setup without redundant server save',async()=>{
 const {context,calls,state,draft}=workspace();state.currentProject.draft={refs:draft.refs,prompts:draft.prompts,mode:draft.mode};
 await context.saveWorkspaceDraft();assert.deepEqual(calls,['local-save']);
 state.currentProject.draft={};await context.saveWorkspaceDraft();assert.deepEqual(calls,['local-save','local-save','persist','server-save']);
});
test('Open on the active project keeps unsaved editor inputs and changes view directly',async()=>{
 const {context,calls}=workspace();await context.openProjectWorkspace('p');assert.deepEqual(calls,['studio']);
});
test('reference rename is shot-local, rewrites case variants and rejects alias case collisions',()=>{
 const source=fs.readFileSync('web/studio.js','utf8');
 const handler=source.slice(source.indexOf('    name.onchange=()=>{'),source.indexOf('    nameWrap.append(nameLabel,name);'));
 const ref={alias:'Hero',assetId:'a'},name={value:'1'},prompt={value:'@HERO walks past @heroine'};let mutations=0;
 const context={locked:false,ref,name,state:{refs:[ref,{alias:'2'}],prompts:{refs:'@hero enters'},currentProject:{}},$:()=>prompt,renderRefs(){},saveDraft(){},updatePreviewLive(){},workspaceMutation(){mutations++;},info(){}};
 vm.createContext(context);vm.runInContext(handler,context);name.onchange();
 assert.equal(ref.alias,'1');assert.equal(prompt.value,'@1 walks past @heroine');assert.equal(context.state.prompts.refs,'@1 enters');assert.equal(mutations,0);
 name.value='TWO';context.state.refs[1].alias='two';name.onchange();assert.equal(ref.alias,'1');assert.equal(name.value,'1');
});
test('project links are durable from a bare URL and preserve pending Reuse transaction',()=>{
 const reuse=require('../../web/h3/reuse-navigation');
 assert.equal(new URL(reuse.projectLink('https://studio.test/index.html#elements','p')).searchParams.get('project'),'p');
 const pending='https://studio.test/index.html?reuse=video.mp4#studio';assert.equal(reuse.projectLink(pending,'p'),pending);
});

test('Open remains a separate-tab link during a render and never mutates the running editor',async()=>{
 const {context,state,calls}=workspace();context.URL=URL;context.location={href:'https://studio.test/index.html?job=old&reuse=video&reuse_request=old#projects'};
 context.document={createElement:()=>({dataset:{}})};state.busy=true;state.running='job1';
 const refs=state.refs,link=context.projectOpenAction({project_id:'other'});let prevented=false;
 await link.onclick({preventDefault(){prevented=true;},button:0});
 assert.equal(prevented,false);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener');
 const url=new URL(link.href);assert.equal(url.searchParams.get('project'),'other');assert.equal(url.hash,'#studio');assert.equal(url.searchParams.has('job'),false);assert.equal(url.searchParams.has('reuse'),false);
 assert.equal(state.running,'job1');assert.equal(state.refs,refs);assert.deepEqual(calls,[]);
 state.busy=false;context.openProjectWorkspace=async id=>calls.push(id);await link.onclick({preventDefault(){prevented=true;},button:0});assert.equal(prevented,true);assert.deepEqual(calls,['other']);
});

test('new tab boot uses its explicit API base instead of a different legacy server',()=>{
 const {context}=workspace();context.URL=URL;context.location={href:'https://studio.test/index.html#projects'};context.document={createElement:()=>({dataset:{}})};
 const source=fs.readFileSync('web/studio.js','utf8');
 for(const selected of ['https://api-b.test/comfy','']){
  context.projectCtrl.apiBase=selected;const link=context.projectOpenAction({project_id:'p'});
  const memory=new Map(),boot={URL,location:new URL(link.href),history:{replaceState(_a,_b,href){boot.location=new URL(href);}},sessionStorage:{setItem:(k,v)=>memory.set(k,v),getItem:k=>memory.has(k)?memory.get(k):null},localStorage:{getItem:()=> 'https://api-a.test'}};
  vm.createContext(boot);vm.runInContext(source.slice(source.indexOf('const baseKey ='),source.indexOf('const draftKey =')),boot);
  assert.equal(memory.get('h3studio.comfyBase'),selected);assert.equal(boot.location.searchParams.has('api_base'),false);
 }
});

test('browsing Projects during a render does not save or replace its active setup',async()=>{
 const {context,state,calls}=workspace();state.busy=true;context.document={body:{classList:{add(){}}}};context.renderProjectHub=async()=>calls.push('hub');
 await context.showProjectHub();assert.deepEqual(calls,['projects','hub']);assert.equal(state.activeProjectId,'p');
});

test('explicit project refresh retains Projects and Elements pages instead of forcing Production',async()=>{
 const source=fs.readFileSync('web/studio.js','utf8');
 for(const view of ['projects','elements','studio']){
  const state={hydrationEpoch:0},seen=[];
  const context={state,URL,URLSearchParams,location:new URL('https://studio.test/index.html?project=p#'+view),baseKey:'server',projectCtrl:null,
   sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},localStorage:{getItem:()=>null,setItem(){}},
   H3ProjectController:{ProjectController:class{_storageKey(key){return key;}async loadProject(){return {project_id:'p'};}}},
   hydrateWorkspaceDraft:async()=>true,refreshLabControls(){},setWorkspaceView:view=>seen.push(view),info(){}};
  vm.createContext(context);vm.runInContext(source.slice(source.indexOf('async function initProjectController()'),source.indexOf('function updateProjectUI(proj)')),context);
  await context.initProjectController();assert.deepEqual(seen,[view]);
 }
});


test('empty scene navigation checkpoints locally without sending an invalid shot draft',async()=>{
 const {context,calls}=workspace();context.projectCtrl.draftScope={scene_id:'scene'};await context.saveWorkspaceDraft();assert.deepEqual(calls,['local-save']);
});

test('New project saves previous inputs and resets configuration instead of inheriting it',async()=>{
 const {context,calls,state}=workspace();const controls=new Map();context.$=id=>{if(!controls.has(id))controls.set(id,{value:'old',close(){calls.push('close');}});return controls.get(id);};
 context.emptyWorkspaceDraft=()=>({canvas:{width:1344,height:768},settings:{seed:'42',steps:'20'},refs:[],loras:[]});
 context.withProjectLoading=async action=>{state.projectLoading=true;try{return await action();}finally{state.projectLoading=false;}};
 context.projectCtrl.createProject=async(name,canvas)=>{calls.push(['create',name,canvas]);return {project_id:'new',name};};
 context.H3OrganizationUI={fileNewProject:async p=>p};context.H3ScenesUI={restore:p=>calls.push(['scope',p.project_id])};context.hydrateProjectDraft=async draft=>calls.push(['hydrate',draft]);context.updateProjectUI=()=>{};context.showStageMessage=()=>{};
 await context.createWorkspaceProject('  Film B  ');assert.equal(calls[0],'local-save');assert.equal(calls.find(x=>Array.isArray(x)&&x[0]==='create')[1],'Film B');const blank=calls.find(x=>Array.isArray(x)&&x[0]==='hydrate')[1];assert.equal(blank.settings.seed,'42');assert.deepEqual(blank.loras,[]);assert.equal(state.current,null);assert.equal(controls.get('newProjectName').value,'');
});

test('Save and Export share guarded saving and download includes the latest editor setup',async()=>{
 const {context,state,calls}=workspace();context.withProjectLoading=async action=>{calls.push('lock');try{return await action();}finally{calls.push('unlock');}};context.syncRestoredInputStatus=()=>{};context.info=()=>{};state.restoreMissing=[];
 await context.saveWorkspaceSetup();assert.deepEqual(calls,['lock','local-save','unlock']);calls.length=0;
 context.projectCtrl.exportBundle=async()=>{calls.push('export');return 'https://studio.test/bundle.zip';};const link={click(){calls.push(['download',this.href]);},remove(){}};context.document={createElement:()=>link,body:{append(){}}};await context.exportWorkspaceProject();assert.deepEqual(calls,['lock','local-save','export',['download','https://studio.test/bundle.zip'],'unlock']);
 state.busy=true;calls.length=0;await context.exportWorkspaceProject();await context.saveWorkspaceSetup();assert.deepEqual(calls,[]);
});

test('Reuse folders collapse only in unfiltered All view, while search exposes matching setups',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/h3/organization-ui.js','utf8')+';globalThis.listing=H3OrganizationUI.listing;',ctx);
 const projects=[{project_id:'root',name:'Film'},{project_id:'a',name:'Reuse one',folder_id:'reuse'},{project_id:'b',name:'Reuse two',folder_id:'reuse'},{project_id:'regular',name:'Regular',folder_id:'normal'}],folders=[{id:'reuse',kind:'reuse',source_project_id:'root'},{id:'normal'}];
 let shown=ctx.listing(projects,folders);assert.deepEqual(Array.from(shown.projects,p=>p.project_id),['root','regular']);assert.equal(shown.folders[0].projects.length,2);
 shown=ctx.listing(projects,folders,{query:'Reuse'});assert.equal(shown.projects.length,2);assert.equal(shown.folders.length,0);
 shown=ctx.listing(projects,folders,{folder:'reuse'});assert.equal(shown.projects.length,2);assert.equal(shown.folders.length,0);assert.equal(ctx.listing(projects,folders,{folder:'unfiled'}).projects.length,1);
});

test('explicit Save and Export never claim to persist an empty scene with no shot',async()=>{
 const {context,calls}=workspace();context.projectCtrl.draftScope={scene_id:'empty'};
 await assert.rejects(context.saveWorkspaceSetup(),/Create or select a shot/);await assert.rejects(context.exportWorkspaceProject(),/Create or select a shot/);assert.deepEqual(calls,[]);
});

test('unrelated server videos do not expose an empty Assemble sequence action',()=>{
 const source=fs.readFileSync('web/studio.js','utf8'),start=source.indexOf('function renderSequenceCard()'),end=source.indexOf('\nif ($("btnAssembleSequence"))',start);
 let hidden=false;const card={classList:{add:value=>hidden=value==='hidden'}};
 const context={state:{currentProject:{},results:[{file:'other-project.mp4'}]},projectCtrl:{},H3Scenes:{sequenceTakes:()=>[]},$:id=>id==='sequenceCard'?card:{}};vm.createContext(context);vm.runInContext(source.slice(start,end)+';renderSequenceCard();',context);assert.equal(hidden,true);
});
