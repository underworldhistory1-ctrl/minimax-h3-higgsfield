const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const compiler=require('../../web/h3/prompt-compiler.js');
function workspace(assets,prompt='@hero @room'){
 const input={value:prompt,selectionStart:prompt.length,selectionEnd:prompt.length,setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);},focus(){}};
 const state={currentProject:{assets,asset_categories:[]},activeProjectId:'p',refs:[],mode:'refs',prompts:{refs:prompt},busy:false};
 const context={state,H3PromptCompiler:compiler,$:id=>id==='prompt'?input:{classList:{add(){}}},setTimeout,clearTimeout,info(){},renderRefs(){},renderPromptAssets(){},saveDraft(){},maxRefs:{image:9}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('web/h3/project-workspace.js','utf8').replace(/initWorkspaceNavigation\(\);\s*initProjectWorkspace\(\);\s*H3OrganizationUI.init\(\);\s*$/,''),context);
 context.projectCtrl={apiUrl:p=>p};context.renderProjectCatalog=()=>{};
 return {context,state,input};
}
test('typed mention paste attaches every project asset serially',async()=>{
 const {context,state}=workspace([{asset_id:'a',alias:'hero',kind:'image'},{asset_id:'b',alias:'room',kind:'image'}]);
 context.activateProjectAsset=async item=>{if(vm.runInContext('workspaceCatalogBusy',context))throw Error('busy');vm.runInContext('workspaceCatalogBusy=true',context);await new Promise(r=>setTimeout(r,2));state.refs.push(item);vm.runInContext('workspaceCatalogBusy=false',context);};
 await context.syncPromptMentionsToReferences();await new Promise(r=>setTimeout(r,20));assert.equal(state.refs.length,2);
});
test('display names compile to canonical IDs while legacy aliases remain valid',()=>{
 const references=[{asset_id:'a',alias:'old_filename',name:'Bathroom set',kind:'image',role:'custom'}];
 for(const name of ['Bathroom set','Bathroom_set','old_filename'])assert.match(compiler.compilePrompt({mode:'refs',source_prompt:'Film @'+name+'.',references}).compiled_prompt,/<Picture 1>\./);
});
test('ambiguous display names fail closed and exact aliases retain priority',()=>{
 const references=[{asset_id:'a',alias:'first',name:'Hero',kind:'image',role:'custom'},{asset_id:'b',alias:'second',name:'Hero',kind:'image',role:'custom'}];
 assert.throws(()=>compiler.compilePrompt({mode:'refs',source_prompt:'@Hero enters',references}),/ambiguous/i);
 assert.doesNotThrow(()=>compiler.compilePrompt({mode:'refs',source_prompt:'@first @second',references}));
});
test('late Use insertion cannot overwrite edits made while downloading media',async()=>{
 const {context,state,input}=workspace([],'Original prompt');let release;
 context.activateProjectAsset=async item=>{await new Promise(r=>release=r);state.refs.push(item);return item;};
 const pending=context.insertProjectMention({assetId:'a',alias:'hero',catalog:true});input.value='Newer prompt';release();
 await assert.rejects(pending,/prompt changed/i);assert.equal(input.value,'Newer prompt');assert.equal(state.refs.length,0);
});
test('same-ID direct uploads keep shot alias and exact authored prompt after project refresh',()=>{
 const {context,state,input}=workspace([],'@hero enters');state.refs=[{assetId:'a',alias:'hero',name:'Hero',label:'Hero'}];
 Object.assign(context,{appendProjectResults(){},renderResults(){},renderSequenceCard(){},refreshProjectList:async()=>{},renderProjectHub:async()=>{}});
 const source=fs.readFileSync('web/studio.js','utf8');vm.runInContext(source.slice(source.indexOf('function updateProjectUI(proj)'),source.indexOf('async function applyQwenHandoff')),context);
 context.updateProjectUI({project_id:'p',name:'Film',assets:[{asset_id:'a',alias:'first',name:'Renamed Hero'}]});
 assert.equal(state.refs[0].alias,'hero');assert.equal(state.refs[0].name,'Renamed Hero');assert.equal(input.value,'@hero enters');
});
test('an already attached catalog asset preserves current Text prompt when used again',async()=>{
 const {context,state,input}=workspace([{asset_id:'a',alias:'hero',kind:'image'}],'New text prompt');state.mode='text';state.refs=[{assetId:'a',alias:'hero'}];state.prompts.refs='Old references prompt';
 context.selectMode=mode=>{state.mode=mode;input.value=state.prompts[mode];};
 await context.insertProjectMention({assetId:'a',alias:'hero',catalog:true});assert.equal(input.value,'New text prompt@hero ');
});
test('renamed display mention survives through saved previous names without changing authored text',()=>{
 const references=[{asset_id:'a',alias:'file',name:'New Hero',mention_names:['Old Hero'],kind:'image',role:'custom'}];
 assert.match(compiler.compilePrompt({mode:'refs',source_prompt:'@Old_Hero enters.',references}).compiled_prompt,/<Picture 1> enters/);
});
test('catalog display metadata wins over an old restored draft by stable asset ID',()=>{
 const {context,state}=workspace([{asset_id:'a',alias:'file',name:'Current Hero',mention_names:['Earlier Hero']}]);
 const source=fs.readFileSync('web/studio.js','utf8');vm.runInContext(source.slice(source.indexOf('function referenceDisplay(ref)'),source.indexOf('function mentionItems()')),context);
 const restored={assetId:'a',alias:'shot_name',name:'Earlier Hero'};const display=context.referenceDisplay(restored);
 assert.equal(display.name,'Current Hero');assert.equal(display.mention_names[0],'Earlier Hero');assert.equal(restored.alias,'shot_name');
});
test('attached element mention actions use its assigned name with collision-safe fallback',()=>{
 const {context,state}=workspace([{asset_id:'a',alias:'upload',name:'Named Hero'}]);state.refs=[{assetId:'a',alias:'upload'}];
 context.currentRenderSpec=()=>({references:state.refs.map(ref=>({...ref,...context.referenceDisplay(ref)}))});
 const source=fs.readFileSync('web/studio.js','utf8');vm.runInContext(source.slice(source.indexOf('function referenceDisplay(ref)'),source.indexOf('function mentionItems()')),context);
 vm.runInContext(source.slice(source.indexOf('function preferredReferenceMention(alias)'),source.indexOf('function insertReferenceMention(alias,scroll)')),context);
 assert.equal(context.preferredReferenceMention('upload'),'Named_Hero');
});
