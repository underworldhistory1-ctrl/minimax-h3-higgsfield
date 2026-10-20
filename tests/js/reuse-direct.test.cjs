const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const reuse=require('../../web/h3/reuse-navigation.js');
function setup(){
 const calls=[],data=new Map(),project={project_id:'new-project',revision:2,draft:{mode:'refs',prompts:{refs:'saved prompt'},refs:[{assetId:'image-id'}],settings:{seed:'42'},loras:[{name:'Realism',strength:.7}]}};
 const controller={_storageKey:k=>'server.'+k,async fetchJson(url,opts){calls.push([url,opts]);if(!opts)return project;const body=JSON.parse(opts.body);return {project,missing:[]};},async createProject(){calls.push(['create']);return {...project,revision:1};},async loadProject(id){calls.push(['load',id]);return project;}};
 const options={href:reuse.link('https://studio.test/index.html?job=old#projects','video/take.mp4','request-1'),storage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},replace:url=>calls.push(['replace',url])};return {controller,options,calls,project};
}
test('Reuse button navigates even while old workspace is busy and never mutates it',async()=>{
 let assigned;const ctx={H3ReuseNavigation:reuse,location:{href:'https://studio.test/index.html#projects',assign:u=>assigned=u},crypto:{randomUUID:()=> 'request'},resultOutputPath:()=> 'video/take.mp4',workspaceLocked:()=>true,state:{busy:true,projectLoading:true},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/h3/organization-ui.js','utf8')+';globalThis.flow=H3OrganizationUI;',ctx);await ctx.flow.openReuse({file:{filename:'take.mp4'}});const u=new URL(assigned);assert.equal(u.hash,'#studio');assert.equal(u.searchParams.get('reuse'),'video/take.mp4');
});
test('Landing restores original server draft into independent project and leaves durable link',async()=>{
 const {controller,options,calls,project}=setup();assert.deepEqual(await reuse.restore(controller,options),project);const apply=calls.find(c=>c[0].endsWith('/videos/reuse'));assert.deepEqual(JSON.parse(apply[1].body),{output_file:'video/take.mp4',create_grouped:true,request_id:'request-1'});assert.equal(calls.filter(c=>c[0]==='create').length,0);const u=new URL(calls.find(c=>c[0]==='replace')[1]);assert.equal(u.searchParams.get('project'),'new-project');assert.equal(u.searchParams.has('reuse'),false);assert.equal(u.hash,'#studio');assert.equal(u.searchParams.has('job'),false);
});
test('Retry uses same destination instead of creating duplicate projects',async()=>{
 const {controller,options,calls}=setup();await reuse.restore(controller,options);await reuse.restore(controller,options);assert.equal(calls.filter(c=>c[0]==='create').length,0);const requests=calls.filter(c=>c[0].endsWith('/videos/reuse')).map(c=>JSON.parse(c[1].body));assert.equal(requests[0].request_id,requests[1].request_id);
});
test('Unavailable recorded setup reports the real error without creating an empty replacement',async()=>{
 const {controller,options,calls}=setup();controller.fetchJson=async()=>{throw Error('Saved inputs unavailable');};await assert.rejects(reuse.restore(controller,options),/Saved inputs unavailable/);assert.equal(calls.some(c=>c[0]==='create'),false);
});
test('Normal project URL does not create or reapply reuse',async()=>{
 const {controller,options,calls}=setup();options.href='https://studio.test/index.html?project=saved#studio';assert.equal(await reuse.restore(controller,options),null);assert.equal(calls.length,0);
});

test('Legacy Reuse link receives a durable request ID before the first request can fail',async()=>{
 const {controller,options,calls}=setup();options.href='https://studio.test/index.html?reuse=video%2Ftake.mp4#studio';options.replace=url=>{options.href=url;calls.push(['replace',url]);};
 const fetch=controller.fetchJson;controller.fetchJson=async()=>{throw Error('Gateway unavailable');};await assert.rejects(reuse.restore(controller,options),/Gateway unavailable/);
 const id=new URL(options.href).searchParams.get('reuse_request');assert.match(id,/^[a-f0-9-]{36}$/);
 controller.fetchJson=fetch;await reuse.restore(controller,options);const body=JSON.parse(calls.find(c=>c[0].endsWith('/videos/reuse'))[1].body);assert.equal(body.request_id,id);
});

test('Switching projects updates durable selection instead of restoring the old reused project',()=>{
 const updated=reuse.projectLink('https://studio.test/index.html?project=reused#studio','other');assert.equal(new URL(updated).searchParams.get('project'),'other');
});
test('Reuse landing recovers results without inheriting old active render or busy hydration lock',async()=>{
 const source=fs.readFileSync('web/studio.js','utf8');const start=source.indexOf('async function restoreSession(){'),end=source.indexOf('\nasync function ',start+1);const fn=source.slice(start,end);let saved={server:'server',active:{id:'old-render'},results:[]};const state={};const ctx={reuseLanding:true,state,baseKey:'base',sessionKey:'session',sessionId:'session-id',location:{origin:'server'},sessionStorage:{getItem:k=>k==='base'?'server':JSON.stringify(saved),setItem:(k,v)=>saved=JSON.parse(v)},post:async()=>({recovered:[]}),isStudioOutputName:()=>true,renderResults:()=>{},setBusy:()=>{throw Error('Old render must not lock reused editor');}};vm.createContext(ctx);vm.runInContext(fn+';globalThis.restore=restoreSession;',ctx);await ctx.restore();assert.equal(saved.active,null);assert.equal(state.running,undefined);assert.equal(state.sessionRecoveredFor,'server');
});

test('Reuse helper loads before immediate studio initialization',()=>{
 const html=fs.readFileSync('web/index.html','utf8');assert.ok(html.indexOf('src="./h3/reuse-navigation.js')<html.indexOf('src="./studio.js'));
});

test('Late installed adapter catalog clears false missing warnings without dropping actual missing inputs',()=>{
 const source=fs.readFileSync('web/lab-ui.js','utf8');const start=source.indexOf('function syncRestoredInputStatus(){'),end=source.indexOf('async function retryRestoredInputs()',start);const state={reuseUnresolved:['LoRA Combat','LoRA Missing','reference-id'],reuseRequiredLoras:[{name:'Combat'},{name:'Missing'}],loras:[{name:'Combat',enabled:true,strength:.3}],restoreExtraMissing:[]};const ctx={state,allInputItems:()=>[],$:()=>({hidden:false}),selectedCheckpoint:()=>'',info:()=>{}};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';syncRestoredAdapterStatus();',ctx);assert.deepEqual(Array.from(state.reuseUnresolved),['LoRA Missing','reference-id']);assert.equal(state.reuseRequiredLoras.length,1);assert.equal(state.loras[0].strength,.3);
});
