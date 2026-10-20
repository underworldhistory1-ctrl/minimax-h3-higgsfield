const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){const ctx={Blob,File,URL,console,state:{refs:[],guides:[],controlInputs:{},reuseUnresolved:[]},projectCtrl:{getAsset:async()=>({original_name:'ref.png'}),mediaBlob:async()=>new Blob(['image'],{type:'image/png'})}};ctx.window={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('web/lab-ui.js','utf8'),ctx);return ctx;}
test('failed media restore preserves descriptor and blocks rendering without losing identity',async()=>{const c=setup();c.projectCtrl.mediaBlob=async()=>{throw Error('HTTP 503')};const item=await c.restoreInputItem({assetId:'asset',alias:'66',kind:'image',role:'custom',instruction:'color only'});assert.equal(item.assetId,'asset');assert.equal(item.instruction,'color only');assert.equal(item.file,null);assert.equal(item.restoreError,'HTTP 503');c.state.refs=[item];assert.deepEqual([...c.syncRestoredInputStatus()],['66']);c.state.refs=[];assert.deepEqual([...c.syncRestoredInputStatus()],[]);});
test('retry replaces only failed material and retains editor edits',async()=>{const c=setup();const broken={assetId:'asset',alias:'66',kind:'image',restoreError:'503',file:null};c.state.refs=[broken];c.state.prompts={refs:'edited prompt'};c.state.hydrationEpoch=1;c.renderFrameItem=async()=>{};c.renderRefs=c.renderGuides=c.updatePreviewLive=()=>{};await c.retryRestoredInputs();assert.equal(c.state.refs[0].restoreError,undefined);assert.ok(c.state.refs[0].file.size);assert.equal(c.state.prompts.refs,'edited prompt');assert.deepEqual([...c.syncRestoredInputStatus()],[]);});
test('permanent 404 media errors are not retried; transient download is retried',async()=>{const {ProjectController}=require('../../web/h3/project-controller');const ctrl=new ProjectController();const previous=global.fetch;let count=0;try{global.fetch=async()=>{count++;return count===1?{ok:false,status:503}:{ok:true,blob:async()=>new Blob(['ok'])}};assert.equal((await ctrl.mediaBlob('asset')).size,2);assert.equal(count,2);count=0;global.fetch=async()=>{count++;return {ok:false,status:404}};await assert.rejects(ctrl.mediaBlob('missing'),/404/);assert.equal(count,1);}finally{global.fetch=previous;}});

test('metadata and original bytes restore concurrently with a single preview URL',async()=>{
 const c=setup(),started=[];let record,media;
 c.projectCtrl.getAsset=()=>{started.push('record');return new Promise(resolve=>record=resolve);};
 c.projectCtrl.mediaBlob=()=>{started.push('media');return new Promise(resolve=>media=resolve);};
 const pending=c.restoreInputItem({assetId:'a',alias:'1'});assert.deepEqual(started,['record','media']);
 record({original_name:'ref.png'});media(new Blob(['data']));const result=await pending;assert.equal(result.url,result.previewUrl);URL.revokeObjectURL(result.url);
});

test('all draft input groups start together and a stale hydration revokes every restored URL',async()=>{
 const c=setup();c.state.hydrationEpoch=0;c.state.loras=[];const started=[],release=[],revoked=[];
 c.URL={revokeObjectURL:url=>revoked.push(url)};
 c.restoreInputItem=desc=>{if(!desc)return null;started.push(desc.alias);return new Promise(resolve=>release.push(()=>resolve({...desc,url:desc.alias,previewUrl:desc.alias})));};
 const descriptor=alias=>({alias});const pending=c.hydrateProjectDraft({first:descriptor('first'),last:descriptor('last'),refs:[descriptor('ref')],guides:[descriptor('guide')],controlInputs:{mask:descriptor('mask')}});
 assert.deepEqual(started,['first','last','ref','guide','mask']);c.state.hydrationEpoch++;for(const resolve of release)resolve();await pending;assert.deepEqual(revoked,['first','last','ref','guide','mask']);assert.equal(c.state.first,undefined);
});
