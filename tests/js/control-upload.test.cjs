const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/studio.js'),'utf8');
const start=source.indexOf('    const sendFile=async(file,kind,label,ref=null)=>{');
const end=source.indexOf('\n    if(state.mode==="frames"){',start);
function uploader(mode,resize=true){
 const calls={};const original={size:100,name:'control.png'};
 const context={state:{mode,uploads:[]},$:id=>({checked:resize,value:'contain'}),samplingCanvas:()=>({width:864,height:480}),
  uploadMessage(){},setProgress(){},renderRefs(){},saveSession(){},fmtBytes:()=>'',
  fitFrameImage:async()=>{calls.fitted=true;return {size:100,name:'fitted.png'};},
  uploadOne:async(file,kind,progress,waiting,options)=>{calls.file=file;calls.options=options;return {name:'h3_studio_kf_control.png'};},
  projectCtrl:{fetchJson:async(route,options)=>{calls.resolve=JSON.parse(options.body);return {filename:'h3_studio_kf_asset.png'};}}};
 vm.createContext(context);
 const send=vm.runInContext('(()=>{let fileIndex=0;const totalFiles=1;'+source.slice(start,end)+';return sendFile;})()',context);
 return {calls,original,send};
}
test('control images keep the same original alignment in every mode',async()=>{
 for(const mode of ['text','frames','refs']){
  const {calls,original,send}=uploader(mode);await send(original,'image','Still image guidance',{role:'control'});
  assert.equal(calls.file,original);assert.equal(calls.fitted,undefined);assert.equal(calls.options.resize,true);
 }
});
test('server-saved control image resolves without borrowing the frame fit setting',async()=>{
 const {calls,original,send}=uploader('frames');await send(original,'image','Still image guidance',{role:'control',assetId:'saved'});
 assert.equal(calls.resolve.fit,'preserve');assert.equal(calls.fitted,undefined);
});

test('saved reference and frame uploads honor the auto-fit checkbox in both states',async()=>{
 for(const mode of ['refs','frames'])for(const resize of [false,true]){
  const {calls,original,send}=uploader(mode,resize);await send(original,'image','@hero',{assetId:'saved',imageFit:'preserve'});
  assert.equal(calls.resolve.resize,resize);assert.equal(calls.resolve.fit,'preserve');
 }
});

test('saved prompt-preview images receive the same auto-fit intent as generation',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../web/h3/connected-studio.js'),'utf8');
 const start=source.indexOf("        if(kind==='image'&&item.assetId){"),end=source.indexOf('        }else{',start);
 assert.ok(start>0&&end>start);
 for(const mode of ['refs','frames'])for(const resize of [false,true]){
  let received;const context={kind:'image',item:{assetId:'saved',imageFit:'preserve'},state:{mode,uploads:[]},$:()=>({checked:resize}),samplingCanvas:()=>({width:864,height:480}),projectCtrl:{fetchJson:async(_,options)=>{received=JSON.parse(options.body);return {filename:'prepared.png'};}}};
  vm.createContext(context);await vm.runInContext('(async()=>{let result;'+source.slice(start,end)+'}})()',context);
  assert.equal(received.resize,resize);assert.equal(received.fit,'preserve');
 }
});
