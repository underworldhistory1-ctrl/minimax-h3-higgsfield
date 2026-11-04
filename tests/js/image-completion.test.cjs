const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('web/image-studio.js','utf8'),body=source.slice(source.indexOf('let queuePollTimer='),source.indexOf('function imageUrl('));
function fixture(){
 const timers=new Map(),errors=[],shown=[],metadata=[],fields={},state={activePromptId:'owned',generationEpoch:1,busy:true,started:Date.now()-1000,settings:{mode:'create',profile:'int8',width:1024,height:1024,steps:40},results:[]};let sequence=0,metadataFailures=0,queueCalls=0;
 const file={filename:'qwen_studio_owned_00001.png'},history={owned:{outputs:{save:{images:[file]}}}};
 const context={state,AbortSignal,Date,api:x=>x,$:id=>fields[id]||=( {textContent:''}),fmt:String,showError:e=>errors.push(e),showImage:e=>shown.push(e),setBusy:value=>state.busy=value,setProgress(){},cleanupUploads:async()=>{},loadLibrary:async()=>{},sessionStorage:{removeItem(){}},localStorage:{getItem:()=>null,setItem(){}},H3RenderValues:{readJson:r=>r.json()},setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),recoverPendingImage:async()=>{},pollImageProgress:async()=>{},finishFailure:async()=>assert.fail('Connection failures are not failed renders'),fetch:async (url,options)=>{
  if(url.includes('image_details')){metadata.push(JSON.parse(options.body));if(metadataFailures-- >0)throw Error('Connection lost');return {ok:true};}
  if(url.includes('/queue')){queueCalls++;return {ok:true,json:async()=>({queue_running:[],queue_pending:[]})};}
  return {ok:true,json:async()=>history};
 }};
 vm.createContext(context);vm.runInContext(body,context);return {context,state,timers,errors,shown,metadata,failMetadata:()=>metadataFailures++,queueCalls:()=>queueCalls};
}
test('rendered Qwen output retries metadata after disconnection and releases the completing latch',async()=>{
 const f=fixture();f.failMetadata();await f.context.pollHistory();assert.equal(f.state.completing,false);assert.equal(f.state.activePromptId,'owned');assert.equal(f.state.busy,true);assert.equal(f.timers.size,1);assert.match(f.errors.at(-1),/Image rendered.*Retrying/);
 await f.context.pollHistory();assert.equal(f.state.activePromptId,null);assert.equal(f.state.busy,false);assert.equal(f.state.completing,false);assert.equal(f.timers.size,0);assert.equal(f.shown.at(-1).filename,'qwen_studio_owned_00001.png');
});
test('HTTP metadata errors retry, while unavailable local timing storage cannot hide completed output',async()=>{
 const f=fixture(),fetch=f.context.fetch;let fail=true;f.context.fetch=async (url,options)=>url.includes('image_details')&&fail?{ok:false}:fetch(url,options);
 await f.context.pollHistory(true);assert.equal(f.state.activePromptId,'owned');assert.equal(f.state.completing,false);fail=false;f.context.localStorage.setItem=()=>{throw Error('Storage denied');};await f.context.pollHistory();assert.equal(f.state.busy,false);assert.equal(f.state.activePromptId,null);
});
test('metadata retries freeze observed completion time and do not reload the same full-size preview',async()=>{
 const f=fixture();f.failMetadata();await f.context.pollHistory();f.state.started-=300000;f.failMetadata();await f.context.pollHistory();assert.equal(f.metadata[0].render_seconds,f.metadata[1].render_seconds);assert.equal(f.shown.length,1);await f.context.pollHistory();assert.equal(f.state.busy,false);assert.equal(f.metadata[2].render_seconds,f.metadata[0].render_seconds);
});
test('quick cancel and regenerate retains only one recurring queue poll',async()=>{
 const f=fixture();await f.context.pollQueue();assert.equal(f.timers.size,1);
 f.context.stopImagePolling();f.state.generationEpoch++;f.state.activePromptId='new';await f.context.pollQueue();assert.equal(f.timers.size,1);
 const callback=[...f.timers.values()][0];await callback();assert.equal(f.timers.size,1);assert.equal(f.queueCalls(),3);
});
test('overlapping queue requests do not multiply polling or apply stale results to a newer job',async()=>{
 const f=fixture(),original=f.context.fetch;let release;f.context.fetch=url=>url==='/queue'?new Promise(resolve=>release=resolve):original(url);
 const first=f.context.pollQueue();await f.context.pollQueue();assert.equal(f.timers.size,0);f.state.generationEpoch++;f.state.activePromptId='new';release({json:async()=>({queue_pending:[[0,'owned']]})});await first;assert.equal(f.timers.size,0);
 f.context.fetch=original;await f.context.pollQueue();assert.equal(f.timers.size,1);
});
