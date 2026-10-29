const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('web/image-studio.js','utf8');
const body=source.slice(source.indexOf('async function pollHistory('),source.indexOf('async function completeGeneration('));
function fixture(history){
 const failures=[],timers=[],state={activePromptId:'image-job'};
 const context={state,api:x=>x,fetch:async()=>({}),H3RenderValues:{readJson:async()=>({'image-job':history})},findOutput:()=>null,setTimeout:fn=>timers.push(fn),finishFailure:async(message,cancelled)=>{failures.push({message,cancelled});state.activePromptId=null;}};
 vm.createContext(context);vm.runInContext(body,context);return {context,state,failures,timers};
}
test('a confirmed Qwen graph failure releases the UI even when its websocket event was missed',async()=>{
 const f=fixture({status:{status_str:'error',completed:false,messages:[['execution_error',{exception_message:'Actual node failure'}]]}});
 await f.context.pollHistory(false);assert.equal(f.failures.length,1);assert.match(f.failures[0].message,/Actual node failure/);assert.equal(f.state.activePromptId,null);
});
test('transient history disconnection retains the accepted image job',async()=>{
 const f=fixture(null);f.context.fetch=async()=>{throw Error('Disconnected');};await f.context.pollHistory(false);assert.equal(f.failures.length,0);assert.equal(f.state.activePromptId,'image-job');assert.equal(f.timers.length,1);
});
test('a delayed history response cannot stop a newer image request',async()=>{
 const f=fixture({status:{status_str:'error',messages:[]}});let release;f.context.fetch=()=>new Promise(resolve=>release=resolve);
 const pending=f.context.pollHistory();f.state.activePromptId='newer-image-job';release({});await pending;assert.equal(f.failures.length,0);assert.equal(f.state.activePromptId,'newer-image-job');
});
