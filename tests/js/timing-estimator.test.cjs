const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../../web/h3/timing-estimator.js');
const config=()=>({version:2,gpu:'RTX 5090',model:'FL2VA',mode:'text',method:'native',width:1280,height:704,frames:362,steps:20,adapters:[],references:[],guides:[],passes:[],control:null,continuation:null});
const sample=(configuration,seconds=120,filename='h3_studio_a.mp4',source='execution')=>({configuration,seconds,filename,source});
test('exact settings return actual seconds and observed dispersion',()=>{
 const c=config(),r=E.estimate(c,[sample(c,100,'a'),sample(c,120,'b'),sample(c,160,'c')]);
 assert.equal(r.seconds,120);assert.equal(r.low,100);assert.equal(r.high,160);assert.equal(r.kind,'exact');
});
test('one measured render has no fabricated margin and admits scarcity',()=>{
 const c=config(),r=E.estimate(c,[sample(c,99)]);assert.equal(r.low,99);assert.equal(r.high,99);assert.equal(r.confidence,'low');assert.match(r.basis,/range unknown/);
});
test('size frames and steps variants are similar actual observations without scaling',()=>{
 for(const field of ['width','height','frames','steps']){const c=config(),target={...c,[field]:c[field]*2};const r=E.estimate(target,[sample(c,123)]);assert.equal(r.kind,'similar');assert.equal(r.seconds,123);}
});
test('methods models GPUs and modes never borrow measurements',()=>{
 for(const [key,value] of [['method','turbo'],['mode','frames'],['model','Ref2VA'],['gpu','RTX 6000']]){const c=config();assert.equal(E.estimate({...c,[key]:value},[sample(c)]).seconds,null);}
});
test('ordered adapter chains and strengths isolate variants',()=>{
 const c={...config(),adapters:[{name:'A',strength:.5},{name:'B',strength:1}]};
 assert.equal(E.estimate({...c,adapters:[...c.adapters].reverse()},[sample(c)]).seconds,null);
 assert.equal(E.estimate({...c,adapters:[{name:'A',strength:.6},c.adapters[1]]},[sample(c)]).seconds,null);
});
test('image video audio modalities are isolated and resolution bytes require similar evidence',()=>{
 const c={...config(),mode:'refs',model:'Ref2VA',references:[{kind:'image',bytes:50,width:1024,height:768,duration:null}]};
 for(const refs of [[{...c.references[0],kind:'video',duration:5}],[{...c.references[0],kind:'audio'}]])assert.equal(E.estimate({...c,references:refs},[sample(c)]).seconds,null);
 for(const patch of [{bytes:51},{width:512}])assert.equal(E.estimate({...c,references:[{...c.references[0],...patch}]},[sample(c)]).kind,'similar');
});
test('refine control continuation and guides isolate pass configurations',()=>{
 const c=config();for(const patch of [{passes:[{steps:10,scale:1.25}]},{control:{kind:'depth'}},{continuation:{context_length:39}},{guides:[{frame_idx:25}]}])assert.equal(E.estimate({...c,...patch},[sample(c)]).seconds,null);
});
test('legacy unknown failed and nonfinite observations are excluded',()=>{
 const c=config();assert.equal(E.estimate(c,[{seconds:3,units:1,key:'old'},sample({...c,gpu:'unknown'}),{...sample(c),failed:true},sample(c,NaN)]).seconds,null);assert.equal(E.estimate({...c,version:1},[sample(c)]).seconds,null);
});
test('authoritative execution timestamps override browser duplicates',()=>{
 const c=config();const r=E.estimate(c,[sample(c,400,'a','browser'),sample(c,140,'a'),sample(c,500,'a','browser')]);assert.equal(r.count,1);assert.equal(r.seconds,140);
 const job={status:{messages:[['execution_start',{timestamp:1000}],['execution_success',{timestamp:141000}]]}};assert.equal(E.measured(job).seconds,140);
 assert.equal(E.measured({status:{messages:[...job.status.messages,['execution_error',{}]]}}),null);
});
test('graph traversal captures base adapters once in graph chain order',()=>{
 const graph={1:{class_type:'UNETLoader'},2:{class_type:'LoraLoaderModelOnly',inputs:{model:['1',0],lora_name:'A',strength_model:.5}},3:{class_type:'LoraLoaderModelOnly',inputs:{model:['2',0],lora_name:'B',strength_model:1}},8:{inputs:{model:['3',0]}},9:{class_type:'LoraLoaderModelOnly',inputs:{model:['1',0],lora_name:'A',strength_model:.25}}};
 assert.deepEqual(E.adaptersFor(graph),[{name:'A',strength:.5},{name:'B',strength:1}]);
});
test('refine sampling contributes to overall progress and completed base cannot reset it',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../../web/studio.js'),'utf8');
 const fn=source.slice(source.indexOf('function currentSamplerNodes('),source.indexOf('async function pollServerProgress'));
 const seen=[],state={runMeta:{samplerNodes:[{id:'8',steps:20},{id:'42',steps:10}]},stepDurations:[],lastStep:0};
 const ctx={state,Date,estimateMidpoint:()=>null,setProgress:(label,pct,remaining)=>seen.push({label,pct,remaining}),saveSession:()=>{}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 ctx.samplerProgress(20,20,'8');assert.ok(seen.at(-1).pct<90);
 ctx.samplerProgress(5,10,'42');assert.match(seen.at(-1).label,/refinement/);assert.ok(seen.at(-1).pct<90);
 const count=seen.length;ctx.samplerProgress(20,20,'8');assert.equal(seen.length,count);
 ctx.samplerProgress(10,10,'42');assert.equal(seen.at(-1).pct,90);assert.equal(seen.at(-1).remaining,null);
});
test('reattached references retain a clearly similar measured estimate before upload',()=>{
 const c={...config(),mode:'refs',references:[{kind:'video',bytes:50,width:1024,height:768,duration:5,consumed_frames:107,consumed_bytes:250,soundtrack:true,fit:true,trim:{start:0,duration:5}}]};
 const fresh={...c,references:[{kind:'video',bytes:50,width:null,height:null,duration:null,consumed_frames:null,consumed_bytes:null,soundtrack:true,fit:true,trim:{start:0,duration:5}}]};
 const r=E.estimate(fresh,[sample(c,220)]);assert.equal(r.kind,'similar');assert.equal(r.seconds,220);assert.equal(r.confidence,'low');assert.match(r.basis,/reference workload/);
 assert.equal(E.estimate({...fresh,references:[{...fresh.references[0],trim:{start:0,duration:8}}]},[sample(c)]).seconds,null);
 assert.equal(E.estimate({...fresh,reference_detail:'max'},[sample(c)]).seconds,null);
});
test('changing trim discards previous consumed metadata and derives only from known source span',()=>{
 const item={kind:'video',file:{size:50},trimEnabled:true,trimStart:4,trimDuration:3,meta:{trimmed:true,trim_start:0,trim_duration:10,source_duration:20,duration:10,frame_count:240,size:300}};
 const r=E.mediaConfiguration(item,362);assert.equal(r.duration,3);assert.equal(r.source_frames,null);assert.equal(r.consumed_frames,56);assert.equal(r.consumed_bytes,null);assert.equal(r.metadata_status,'derived');
 const unknown=E.mediaConfiguration({...item,meta:{...item.meta,source_duration:undefined}},362);assert.equal(unknown.duration,null);assert.equal(unknown.consumed_frames,null);assert.equal(unknown.metadata_status,'unknown');
});
test('connection hydrates library before session and authoritative history',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../../web/studio.js'),'utf8');
 const start=source.indexOf('await loadLibrary();',source.indexOf('async function checkConnection'));
 const end=source.indexOf('return !missing.length',start);const order=[];
 let release;const gate=new Promise(r=>release=r);
 const ctx={loadLibrary:async()=>{order.push('library-start');await gate;order.push('library-ready');},restoreSession:async()=>order.push('session'),loadHistorySamples:async()=>{assert.deepEqual(order,['library-start','library-ready','session']);order.push('history');},renderEstimates:()=>order.push('estimates')};
 vm.createContext(ctx);const pending=vm.runInContext('(async()=>{'+source.slice(start,end)+'})()',ctx);
 await Promise.resolve();assert.deepEqual(order,['library-start']);release();await pending;assert.deepEqual(order,['library-start','library-ready','session','history','estimates']);
});

test('missing consumed reference evidence cannot be called exact calibration',()=>{const c={...config(),mode:'refs',references:[{kind:'video',duration:null,width:null,height:null,consumed_frames:null}]};const r=E.estimate(c,[sample(c,100,'a'),sample(c,110,'b'),sample(c,120,'c')]);assert.equal(r.kind,'similar');assert.equal(r.confidence,'low');});

test('delayed same-node REST progress cannot regress displayed sampling',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync(require('node:path').join(__dirname,'../../web/studio.js'),'utf8');
 const fn=source.slice(source.indexOf('function currentSamplerNodes('),source.indexOf('async function pollServerProgress'));
 const seen=[],state={runMeta:{samplerNodes:[{id:'8',steps:20},{id:'42',steps:10}]},stepDurations:[],lastStep:0};
 const ctx={state,Date,estimateMidpoint:()=>null,setProgress:(label,pct)=>seen.push({label,pct}),saveSession:()=>{}};vm.createContext(ctx);vm.runInContext(fn,ctx);
 ctx.samplerProgress(15,20,'8');const baseCount=seen.length;ctx.samplerProgress(10,20,'8');assert.equal(seen.length,baseCount);assert.equal(state.lastStep,15);assert.match(seen.at(-1).label,/15\/20/);
 ctx.samplerProgress(6,10,'42');const refineCount=seen.length;ctx.samplerProgress(3,10,'42');assert.equal(seen.length,refineCount);assert.equal(state.lastStep,6);assert.match(seen.at(-1).label,/6\/10/);
});
test('malformed persisted configurations and samples are ignored without sidebar crashes',()=>{
 const c=config();for(const patch of [{guides:[null]},{guides:[{}]},{guides:[{kind:'image',frame_idx:'bad'}]},{adapters:[{name:'A',strength:true}]},{references:[null]},{references:[{kind:'image',width:'wide'}]},{adapters:[null]},{adapters:[{name:'A',strength:Infinity}]},{adapters:[{name:'A',strength:1,refinement_strength:'bad'}]},{passes:[null]},{control:[]},{control:{inputs:[null]}},{continuation:[]}]){
  const malformed={...c,...patch};assert.equal(E.normalize(malformed),null);assert.equal(E.estimate(c,[sample(malformed)]).seconds,null);assert.equal(E.estimate(malformed,[sample(c)]).seconds,null);
 }
 assert.deepEqual(E.deduplicate({bad:'array'}),[]);
});
test('malformed status messages cannot crash authoritative timing parsing',()=>{
 for(const messages of [null,{},'bad',[null,3,{},['execution_start',null],['execution_success',[]]]])assert.equal(E.measured({status:{messages}}),null);
 const messages=[null,{},['execution_start',{timestamp:1000}],['execution_success',{timestamp:121000}]];assert.equal(E.measured({status:{messages}}).seconds,120);assert.equal(E.measured({status:{messages:[...messages,['execution_error',null]]}}),null);
});
test('refine refresh restores its sampler identity and actual max, never base steps',()=>{
 const active={samplerNode:'42',samplerMax:10,lastStep:6,meta:{settings:{steps:20},samplerNodes:[{id:'8',steps:20},{id:'42',steps:10}]}};
 assert.deepEqual(E.restoredProgress(active),{node:'42',max:10,step:6});
 assert.equal(E.restoredProgress({...active,samplerNode:undefined}),null);assert.equal(E.restoredProgress({...active,samplerNode:'unknown'}),null);assert.equal(E.restoredProgress({...active,lastStep:21}),null);
 assert.deepEqual(E.restoredProgress({...active,samplerMax:undefined}),{node:'42',max:10,step:6});
 const fs=require('node:fs'),source=fs.readFileSync(require('node:path').join(__dirname,'../../web/studio.js'),'utf8');
 assert.match(source,/samplerNode:state\.samplerNode,samplerMax:state\.samplerMax/);
 assert.match(source,/samplerProgress\(state\.lastStep,restoredProgress\.max,restoredProgress\.node\)/);
});
test('browser fallback observations stay visibly low confidence regardless of sample count',()=>{
 const c=config(),r=E.estimate(c,[sample(c,100,'a','browser'),sample(c,120,'b','browser'),sample(c,150,'c','browser'),sample(c,170,'d','browser')]);
 assert.equal(r.confidence,'low');assert.equal(r.source,'browser');assert.equal(r.executionCount,0);assert.match(r.basis,/browser observations/i);assert.match(r.basis,/upload\/queue/);
});
test('mixed exact history uses execution timings and confidence follows execution count',()=>{
 const c=config(),mixed=[sample(c,110,'a'),sample(c,130,'b'),sample(c,1000,'c','browser'),sample(c,2000,'d','browser')];
 const r=E.estimate(c,mixed);assert.equal(r.seconds,120);assert.equal(r.high,130);assert.equal(r.count,2);assert.equal(r.executionCount,2);assert.equal(r.source,'execution');assert.equal(r.confidence,'low');assert.match(r.basis,/browser observations excluded/);
 const calibrated=E.estimate(c,[...mixed,sample(c,150,'e')]);assert.equal(calibrated.count,3);assert.equal(calibrated.confidence,'measured');assert.equal(calibrated.seconds,130);
});
