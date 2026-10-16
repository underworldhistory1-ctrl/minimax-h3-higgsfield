const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(active=false,scope=null){
 const nodes=new Map();
 function $(id){if(!nodes.has(id))nodes.set(id,{value:'',open:false,options:[],disabled:false,replaceChildren(){this.options=[];},append(n){this.options.push(n);},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);}
 const project={project_id:'project',revision:7,draft:{settings:{seed:42},loras:[]},scenes:[{scene_id:'scene',name:'Scene',shots:[{shot_id:'shot',name:'Shot',draft:{settings:{seed:99},loras:[]}}]}]};
 const calls=[];
 const controller={draftScope:scope,async fetchJson(url,opts){calls.push([url,opts]);if(url.endsWith('/videos/reuse')){if(!JSON.parse(opts.body).target_project_id)return {available:true,complete:true,draft:project.draft,assets:[],source_project_id:'project'};if(active)throw Error('Finish active project jobs before replacing its draft.');return {project,missing:[]};}return project;},async listProjects(){return {projects:[{project_id:'project',name:'Film'}]};},async loadProject(id){calls.push(['load',id]);},async createProject(){return project;}};
 const ctx={H3Scenes:require('../../web/h3/scenes-ui.js'),H3ScenesUI:{restore(){}},$,projectCtrl:controller,state:{activeProjectId:'project',loras:[]},api:()=>'',workspaceLocked:()=>false,resultOutputPath:()=> 'video/take.mp4',workspaceElement:(_tag,text)=>({textContent:text,value:''}),withProjectLoading:async f=>f(),saveWorkspaceDraft:async()=>{},hydrateProjectDraft:async d=>{calls.push(['hydrate',d]);},selectedCheckpoint:()=>'',info:()=>{},setWorkspaceView:v=>calls.push(['view',v]),showStageMessage:()=>{},saveDraft:()=>{},console};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/h3/organization-ui.js','utf8')+';globalThis.flow=H3OrganizationUI;',ctx);
 return {ctx,calls,$};
}
test('Reuse restores saved settings and opens Production without a second click',async()=>{
 const {ctx,calls,$}=setup();await ctx.flow.openReuse({file:{filename:'take.mp4'}});
 assert.ok(calls.some(c=>c[0]==='hydrate'&&c[1].settings.seed===42));
 assert.ok(calls.some(c=>c[0]==='view'&&c[1]==='studio'));
 assert.equal($('reuseDialog').open,false);
 assert.equal(calls.filter(c=>c[0].endsWith('/videos/reuse')).length,2);
});
test('Active work keeps recovery dialog open without hydrating or starting generation',async()=>{
 const {ctx,calls,$}=setup(true);await ctx.flow.openReuse({file:{filename:'take.mp4'}});
 assert.equal($('reuseDialog').open,true);
 assert.match($('reuseStatus').textContent,/Finish active/);
 assert.equal(calls.some(c=>c[0]==='hydrate'),false);
});

test('Reuse sends selected scene and shot and hydrates nested destination',async()=>{
 const {ctx,calls}=setup(false,{scene_id:'scene',shot_id:'shot'});await ctx.flow.openReuse({file:{filename:'take.mp4'}});
 const applied=calls.filter(c=>c[0].endsWith('/videos/reuse')).map(c=>JSON.parse(c[1].body)).find(body=>body.target_project_id);
 assert.equal(applied.target_scene_id,'scene');assert.equal(applied.target_shot_id,'shot');
 assert.ok(calls.some(c=>c[0]==='hydrate'&&c[1].settings.seed===99));
});
