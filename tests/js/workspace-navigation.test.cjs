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
 const context={ref,name,state:{refs:[ref,{alias:'2'}],prompts:{refs:'@hero enters'},currentProject:{}},$:()=>prompt,renderRefs(){},saveDraft(){},updatePreviewLive(){},workspaceMutation(){mutations++;},info(){}};
 vm.createContext(context);vm.runInContext(handler,context);name.onchange();
 assert.equal(ref.alias,'1');assert.equal(prompt.value,'@1 walks past @heroine');assert.equal(context.state.prompts.refs,'@1 enters');assert.equal(mutations,0);
 name.value='TWO';context.state.refs[1].alias='two';name.onchange();assert.equal(ref.alias,'1');assert.equal(name.value,'1');
});
test('project links are durable from a bare URL and preserve pending Reuse transaction',()=>{
 const reuse=require('../../web/h3/reuse-navigation');
 assert.equal(new URL(reuse.projectLink('https://studio.test/index.html#elements','p')).searchParams.get('project'),'p');
 const pending='https://studio.test/index.html?reuse=video.mp4#studio';assert.equal(reuse.projectLink(pending,'p'),pending);
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
