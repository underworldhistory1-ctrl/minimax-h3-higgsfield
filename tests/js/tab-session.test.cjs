const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepare}=require('../../web/h3/tab-session.js');
function storage(){
  const values=new Map(Object.entries({
    'h3studio.client.id.v1':'old-client','h3studio.session.id.v3':'old-session',
    'h3studio.session.v3':'active-job','h3studio.draft.v3':'old-prompt',
    'h3.tab.setup.http://server/project/p':'files',
    'h3_lab.http://server.active_project_id':'p','h3_lab.http://server.scene_scope.p':'shot',
    'h3studio.comfyBase':'http://server','qwen.imageDraft':'image','qwen.activePromptId':'image-job','qwen.activeJob':'receipt','qwen.clientId':'image-client','h3.tab.setup.image.references':'image-files',
    'h3_lab.imported_handoff':'handoff','unrelated':'keep'
  }));
  return {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k)};
}
test('fresh navigation discards inherited video setup and job ownership only',()=>{
  const s=storage();prepare(s,'navigate');
  for(const k of ['h3studio.client.id.v1','h3studio.session.id.v3','h3studio.session.v3','h3studio.draft.v3','h3.tab.setup.http://server/project/p','h3_lab.http://server.active_project_id','h3_lab.http://server.scene_scope.p'])assert.equal(s.getItem(k),null,k);
  for(const k of ['h3studio.comfyBase','qwen.imageDraft','h3_lab.imported_handoff','unrelated'])assert.ok(s.getItem(k),k);
});
test('reload keeps input files, identity, active job and project scope',()=>{
  const s=storage(),before=s.length;prepare(s,'reload');assert.equal(s.length,before);assert.equal(s.getItem('h3studio.session.v3'),'active-job');
});
test('unknown and history navigation do not adopt inherited jobs',()=>{
  for(const type of [undefined,'back_forward']){const s=storage();prepare(s,type);assert.equal(s.getItem('h3studio.client.id.v1'),null);}
});
test('fresh image page clears copied image ownership and inputs but keeps video state',()=>{
 const s=storage();prepare(s,'navigate','image');
 for(const key of ['qwen.imageDraft','qwen.activePromptId','qwen.activeJob','qwen.clientId','h3.tab.setup.image.references'])assert.equal(s.getItem(key),null,key);
 assert.equal(s.getItem('h3studio.session.v3'),'active-job');assert.equal(s.getItem('h3studio.comfyBase'),'http://server');
});
test('image reload retains its active image request and references',()=>{
 const s=storage();prepare(s,'reload','image');assert.equal(s.getItem('qwen.activePromptId'),'image-job');assert.equal(s.getItem('h3.tab.setup.image.references'),'image-files');
});
