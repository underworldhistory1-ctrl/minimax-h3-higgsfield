const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('web/lab-ui.js','utf8');
const hydrate=source.slice(source.indexOf('async function hydrateWorkspaceDraft('),source.indexOf('async function hydrateProjectDraft('));
async function restore(options,local=null){
 const draft={prompts:{refs:'@hero walks'},refs:[{assetId:'a',alias:'hero'}],settings:{steps:8}};
 const project={project_id:'p',draft};let restored,inheritCalls=0;
 const context={projectCtrl:{},state:{activeProjectId:'p'},tabProjectDraftKey:()=> 'p',H3TabDraftStore:{load:async()=>local},emptyWorkspaceDraft:()=>({prompts:{},refs:[]}),location:{href:'https://studio.test/?project=p'},URL,H3ProjectSettings:{inherit:x=>{inheritCalls++;return x;}},rebaseWorkspaceAssets:x=>x,hydrateProjectDraft:async x=>{restored=x;}};
 vm.createContext(context);vm.runInContext(hydrate,context);await context.hydrateWorkspaceDraft(project,options);
 return {restored,draft,inheritCalls};
}
test('explicit reuse restores complete saved inputs after reuse URL was cleaned',async()=>{
 const r=await restore({freshTab:false,reuse:true});assert.equal(r.restored,r.draft);assert.equal(r.inheritCalls,0);assert.equal(r.restored.refs[0].alias,'hero');
});
test('ordinary fresh project tab stays blank and inherits controls only',async()=>{
 const r=await restore({freshTab:true});assert.deepEqual(r.restored.refs,[]);assert.deepEqual(r.restored.prompts,{});assert.equal(r.inheritCalls,1);
});
test('explicit reuse takes precedence over an early blank local autosave',async()=>{
 const r=await restore({reuse:true},{prompts:{},refs:[]});assert.equal(r.restored,r.draft);assert.equal(r.restored.refs.length,1);
});
test('normal refresh preserves the local edited draft',async()=>{
 const local={prompts:{refs:'edited'},refs:[]};const r=await restore({},local);assert.equal(r.restored,local);
});
