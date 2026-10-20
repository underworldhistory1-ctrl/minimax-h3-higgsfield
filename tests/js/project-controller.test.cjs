const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProjectController } = require('../../web/h3/project-controller.js');

test('asset APIs stream original bytes through gateways and return canonical filename', async () => {
  const original = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({url, options});
    return {ok:true, json:async () => url.endsWith('/resolve') ? {filename:'h3_lab/media.png'} : {asset:{asset_id:'asset/id'}}, blob:async () => new Blob(['media'])};
  };
  try {
    const controller = new ProjectController({apiBase:'http://localhost:8188/'});
    const file = new File(['data'], 'chosen.png', {type:'image/png'});
    await controller.uploadAsset(file, 'project', {category:'characters', name:'Named Hero'});
    const query = new URL(requests[0].url).searchParams;
    assert.equal(query.get('project_id'), 'project');
    assert.equal(query.get('filename'), 'chosen.png');
    assert.equal(query.get('name'), 'Named Hero');
    assert.equal(query.get('category'), 'characters');
    assert.equal(requests[0].options.headers['Content-Type'], 'application/octet-stream');
    assert.equal(requests[0].options.body, file);
    assert.equal(await controller.resolveAsset('asset/id'), 'h3_lab/media.png');
    assert.ok(requests[1].url.endsWith('/assets/asset%2Fid/resolve'));
    assert.equal(await (await controller.mediaBlob('asset/id')).text(), 'media');
    await controller.getAsset('asset/id');
    assert.ok(requests[3].url.endsWith('/assets/asset%2Fid'));
  } finally { global.fetch = original; }
});

test('asset resolution fails closed on missing canonical filename', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ok:true, json:async () => ({})});
  try { await assert.rejects(new ProjectController().resolveAsset('a'), /no server filename/); }
  finally { global.fetch = original; }
});

test('immutable asset downloads share concurrent requests and reuse bounded media',async()=>{
 const controller=new ProjectController();let records=0,downloads=0;
 controller.fetchJson=async()=>{records++;return {asset:{original_name:'hero.png'}};};
 controller.downloadMedia=async()=>{downloads++;return new Blob(['media']);};
 const [a,b]=await Promise.all([controller.mediaBlob('hero'),controller.mediaBlob('hero')]);
 assert.equal(a,b);assert.equal(downloads,1);await controller.mediaBlob('hero');assert.equal(downloads,1);
 await Promise.all([controller.getAsset('hero'),controller.getAsset('hero')]);assert.equal(records,1);
 controller.downloadMedia=async()=>({size:8*1024*1024});
 for(let i=0;i<10;i++)await controller.mediaBlob('asset'+i);
 assert.ok(controller.mediaBytes<=64*1024*1024);assert.equal(controller.assetMedia.has('hero'),false);
 controller.downloadMedia=async()=>({size:9*1024*1024});await controller.mediaBlob('video');assert.equal(controller.assetMedia.has('video'),false);
});

test('failed cached asset requests remain retryable and concurrent project lists coalesce',async()=>{
 const controller=new ProjectController();let attempts=0;
 controller.downloadMedia=async()=>{if(++attempts===1)throw Error('offline');return new Blob(['ok']);};
 await assert.rejects(controller.mediaBlob('hero'),/offline/);await controller.mediaBlob('hero');assert.equal(attempts,2);
 controller.fetchJson=async()=>{throw Error('missing');};await assert.rejects(controller.getAsset('hero'),/missing/);assert.equal(controller.assetRecords.has('hero'),false);
 let count=0,release;controller.fetchJson=()=>{count++;return new Promise(resolve=>release=resolve);};
 const a=controller.listProjects(),b=controller.listProjects();assert.equal(count,1);release({projects:[]});await Promise.all([a,b]);
 const c=controller.listProjects();assert.equal(count,2);release({projects:[]});await c;
});

test('project mutation invalidates a pending list and older completion cannot clear the newer request',async()=>{
 const previous=global.fetch;const pending=[];
 global.fetch=(url,options={})=>{
  if(options.method==='POST')return Promise.resolve({ok:true,json:async()=>({project_id:'new',revision:1})});
  return new Promise(resolve=>pending.push(data=>resolve({ok:true,json:async()=>data})));
 };
 try{
  const controller=new ProjectController(),old=controller.listProjects();
  await controller.fetchJson('/h3_studio/lab/projects',{method:'POST',body:'{}'});
  const current=controller.listProjects();assert.equal(pending.length,2);
  pending[0]({projects:[]});await old;const shared=controller.listProjects();assert.equal(pending.length,2);
  pending[1]({projects:[{project_id:'new'}]});assert.deepEqual(await current,await shared);
 }finally{global.fetch=previous;}
});
