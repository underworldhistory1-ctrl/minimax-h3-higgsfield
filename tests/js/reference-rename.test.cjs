const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const compiler=require('../../web/h3/prompt-compiler.js');
function rename(assets,other=[]){
 const ref={alias:'old',assetId:'new'},name={value:'hero'},prompt={value:'@old walks'};
 const state={refs:[ref,...other],prompts:{refs:prompt.value},currentProject:{assets}};
 const ctx={state,ref,name,locked:false,H3PromptCompiler:compiler,$:()=>prompt,info(){},renderRefs(){},updatePreviewLive(){},saveDraft(){}};
 vm.createContext(ctx);
 const workspace=fs.readFileSync('web/h3/project-workspace.js','utf8');
 vm.runInContext(workspace.slice(workspace.indexOf('function projectCatalogItems()'),workspace.indexOf('async function workspaceMutation')),ctx);
 const source=fs.readFileSync('web/studio.js','utf8');
 const start=source.indexOf('name.onchange=()=>{');
 vm.runInContext(source.slice(start,source.indexOf('nameWrap.append',start)),ctx);
 name.onchange();return {ref,prompt};
}
test('removed element releases its mention name for a new reference',()=>{
 const {ref,prompt}=rename([{asset_id:'removed',alias:'hero',catalog_hidden:true}]);
 assert.equal(ref.alias,'hero');assert.equal(prompt.value,'@hero walks');
});
test('visible canonical catalog name remains reserved',()=>{
 assert.equal(rename([{asset_id:'live',alias:'legacy',name:'hero'}]).ref.alias,'old');
});
test('active reference alias remains reserved case-insensitively',()=>{
 assert.equal(rename([],[{alias:'HERO',assetId:'other'}]).ref.alias,'old');
});
