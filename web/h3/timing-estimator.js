(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.H3TimingEstimator=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=2;
  function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value===undefined?null:value;
  }
  const signature=value=>JSON.stringify(canonical(value));
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  function validMedia(m){
    if(!object(m)||!['image','video','audio'].includes(m.kind))return false;
    if(['bytes','consumed_bytes','width','height','source_width','source_height','duration','source_frames','consumed_frames'].some(k=>m[k]!=null&&(!finite(m[k])||m[k]<0)))return false;
    return m.trim==null||(object(m.trim)&&finite(m.trim.start)&&m.trim.start>=0&&finite(m.trim.duration)&&m.trim.duration>0);
  }
  function normalize(config){
    if(!config||config.version!==VERSION)return null;
    const c=canonical(config);
    if(typeof c.gpu!=='string'||!c.gpu||c.gpu==='unknown'||typeof c.model!=='string'||!c.model||!['text','frames','refs'].includes(c.mode)||!['native','spectrum','motioncache','turbo','turbo_ref'].includes(c.method)||![c.width,c.height,c.frames,c.steps].every(n=>Number.isFinite(n)&&n>0))return null;
    if(!Array.isArray(c.adapters)||!Array.isArray(c.references)||!Array.isArray(c.guides)||!Array.isArray(c.passes))return null;
    if(c.adapters.some(a=>!object(a)||typeof a.name!=='string'||!a.name||!finite(a.strength)||(a.refinement_strength!=null&&!finite(a.refinement_strength))))return null;
    if(c.references.some(m=>m===null?c.mode!=='frames':!validMedia(m))||c.guides.some(m=>!validMedia(m)||(m.frame_idx!=null&&(!Number.isInteger(m.frame_idx)||m.frame_idx<0))||(m.strength!=null&&!finite(m.strength))))return null;
    if(c.passes.some(p=>!object(p)||!finite(p.steps)||p.steps<=0||(p.scale!=null&&(!finite(p.scale)||p.scale<=0))||(p.denoise!=null&&!finite(p.denoise))))return null;
    if(c.control!=null&&!object(c.control)||c.continuation!=null&&!object(c.continuation))return null;
    if(c.control?.inputs!=null&&(!object(c.control.inputs)||Object.values(c.control.inputs).some(m=>m!==null&&!validMedia(m))))return null;
    return c;
  }
  function measured(job){
    if(job?.status?.status_str==='error')return null;
    if(!Array.isArray(job?.status?.messages))return null;
    if(job.status.messages.some(e=>Array.isArray(e)&&(e[0]==='execution_error'||e[0]==='execution_interrupted')))return null;
    const events=job.status.messages.filter(e=>Array.isArray(e)&&typeof e[0]==='string'&&object(e[1]));
    if(events.some(e=>e[0]==='execution_error'||e[0]==='execution_interrupted'))return null;
    const start=events.find(e=>e[0]==='execution_start')?.[1]?.timestamp;
    const end=events.find(e=>e[0]==='execution_success')?.[1]?.timestamp;
    return Number.isFinite(start)&&Number.isFinite(end)&&end>start?{seconds:(end-start)/1000,source:'execution',started:start,finished:end}:null;
  }
  function deduplicate(samples){
    const named=new Map();
    for(const s of Array.isArray(samples)?samples:[]){
      if(!s?.filename||!Number.isFinite(s.seconds)||s.seconds<=0||s.seconds>=86400||s.failed||!normalize(s.configuration))continue;
      const previous=named.get(s.filename);
      if(!previous||s.source==='execution'||previous.source!=='execution')named.set(s.filename,s);
    }
    return [...named.values()];
  }
  function mediaSelection(media){
    if(!media)return null;
    return {kind:media.kind,soundtrack:!!media.soundtrack,fit:media.fit??null,trim:media.trim??null};
  }
  function compatible(config){
    const c={...config};delete c.width;delete c.height;delete c.frames;delete c.steps;
    // Upload-only observations can refine exact matches, but do not hide measured
    // estimates for a newly attached source with the same selected workload.
    c.references=c.references.map(mediaSelection);
    c.guides=c.guides.map(m=>({...mediaSelection(m),frame_idx:m.frame_idx,strength:m.strength??null}));
    return signature(c);
  }
  function mediaConfiguration(item,outputFrames){
    const m=item?.meta||{},kind=item.kind||'image',trim=item.trimEnabled?{start:Number(item.trimStart)||0,duration:Number(item.trimDuration)||null}:null;
    const metadataMatches=kind==='image'||(trim?m.trimmed===true&&Number(m.trim_start)===trim.start&&Number(m.trim_duration)===trim.duration:!m.trimmed);
    const sourceDuration=m.source_duration??item.localDuration??(!m.trimmed?m.duration:null)??null;
    const desiredDuration=trim&&Number.isFinite(sourceDuration)?Math.min(trim.duration,Math.max(0,sourceDuration-trim.start)):!trim?sourceDuration:null;
    const frames=metadataMatches?(m.frame_count??item.frame_count??null):null;
    const derivedFrames=Number.isFinite(desiredDuration)?Math.floor(desiredDuration*24):null;
    const consumed=frames??derivedFrames;
    return {kind,bytes:item.file?.size??null,consumed_bytes:metadataMatches?(m.size??null):null,
      width:metadataMatches?(m.width??null):null,height:metadataMatches?(m.height??null):null,
      source_width:m.source_width??null,source_height:m.source_height??null,
      duration:metadataMatches?(m.duration??desiredDuration):desiredDuration,source_frames:frames,
      consumed_frames:kind==='video'&&Number.isFinite(consumed)&&consumed>=5?5+17*Math.floor((Math.min(consumed,outputFrames)-5)/17):consumed,
      metadata_status:metadataMatches&&Number.isFinite(frames)?'measured':Number.isFinite(derivedFrames)?'derived':'unknown',
      soundtrack:!!(item.useAudio||item.use_audio),fit:item.imageFit??item.fitVideo??null,trim};
  }
  function estimate(config,samples){
    const target=normalize(config),unavailable={low:null,high:null,seconds:null,count:0,confidence:'unavailable',basis:'No compatible measured renders yet'};
    if(!target)return {...unavailable,basis:'Timing configuration is unknown; no calibrated estimate'};
    const mediaKnown=m=>!m||(m.kind==='image'?Number.isFinite(m.width)&&Number.isFinite(m.height):m.kind==='video'?Number.isFinite(m.width)&&Number.isFinite(m.height)&&Number.isFinite(m.duration)&&Number.isFinite(m.consumed_frames):Number.isFinite(m.duration));
    const targetKnown=target.references.every(mediaKnown)&&target.guides.every(mediaKnown);
    const valid=deduplicate(samples),exact=targetKnown?valid.filter(s=>signature(normalize(s.configuration))===signature(target)):[];
    let selected=exact,kind='exact';
    if(!selected.length){
      const near=valid.filter(s=>compatible(normalize(s.configuration))===compatible(target)).map(s=>({s,d:['width','height','frames','steps'].reduce((sum,k)=>sum+Math.abs(Math.log(s.configuration[k]/target[k])),0)})).sort((a,b)=>a.d-b.d);
      selected=near.filter(x=>x.d===near[0]?.d).map(x=>x.s);kind='similar';
    }
    if(!selected.length)return unavailable;
    const execution=selected.filter(s=>s.source==='execution'),browserCount=selected.length-execution.length;
    if(execution.length)selected=execution;
    const source=execution.length?'execution':'browser';
    const values=selected.map(s=>s.seconds).sort((a,b)=>a-b),n=values.length;
    const seconds=n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2;
    return {seconds,low:values[0],high:values[n-1],count:n,executionCount:execution.length,source,confidence:kind==='similar'||execution.length<3?'low':'measured',kind,
      basis:(kind==='exact'?'Exact settings':'Similar measurements (size, frames, steps or reference workload differs/unknown; no speed scaling)')+' · '+n+(source==='execution'?' execution measurement'+(n===1?'':'s'):' browser observations (may include upload/queue time; low confidence)')+(execution.length&&browserCount?' · '+browserCount+' browser observations excluded':'')+(n===1?' · one observation; range unknown':' · observed range')};
  }
  function restoredProgress(active){
    if(!object(active)||typeof active.samplerNode!=='string'||!Array.isArray(active.meta?.samplerNodes))return null;
    const node=active.meta.samplerNodes.find(n=>object(n)&&n.id===active.samplerNode&&finite(n.steps)&&n.steps>=2);
    if(!node||!finite(active.lastStep)||active.lastStep<0)return null;
    const max=finite(active.samplerMax)&&active.samplerMax>=2&&active.samplerMax<=node.steps?active.samplerMax:node.steps;
    if(active.lastStep>max)return null;
    return {node:node.id,max,step:active.lastStep};
  }
  function adaptersFor(graph,samplerId='8'){
    let id=graph[samplerId]?.inputs?.model?.[0],seen=new Set(),chain=[];
    while(id!=null&&!seen.has(String(id))){seen.add(String(id));const node=graph[id];if(!node)break;
      if(node.class_type==='LoraLoaderModelOnly')chain.push({name:node.inputs.lora_name,strength:node.inputs.strength_model});
      id=node.inputs?.model?.[0];
    }return chain.reverse();
  }
  return {VERSION,normalize,signature,estimate,measured,deduplicate,adaptersFor,mediaConfiguration,restoredProgress};
});
