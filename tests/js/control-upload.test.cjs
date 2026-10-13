const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/studio.js'),'utf8');
const start=source.indexOf('    const sendFile=async(file,kind,label,ref=null)=>{');
const end=source.indexOf('\n    if(state.mode==="frames"){',start);
function uploader(mode){
 const calls={};const original={size:100,name:'control.png'};
 const context={state:{mode,uploads:[]},$:id=>({checked:true,value:'contain'}),samplingCanvas:()=>({width:864,height:480}),
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
