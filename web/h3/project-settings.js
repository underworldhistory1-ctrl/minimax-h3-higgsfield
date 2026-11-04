(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.H3ProjectSettings=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Only generation controls cross from a completed take into a fresh project tab.
  // Input bindings, prompts and reference-dependent passes stay with the draft.
  function inherit(draft,project){
    if(!project?.project_id||draft?.reuse_source)return draft;
    const takes=(project.takes||[]).filter(t=>t.draft&&t.output_file&&(!t.status||t.status==='completed'));
    const latest=takes.reduce((a,b)=>!a||Number(b.created_at||0)>=Number(a.created_at||0)?b:a,null);
    if(!latest)return draft;
    const source=latest.draft,result={...draft};
    for(const key of ['mode','canvas','settings','loras','enableRefine','fitImages','fitFrames','frameFit','preparationMode'])
      if(source[key]!==undefined)result[key]=structuredClone(source[key]);
    if(source.configuration){
      result.configuration={...structuredClone(source.configuration),preserveReferenceAudio:false,preserveAudioSource:null};
    }
    // Mode follows the model family; prompts and media remain the draft's own.
    return result;
  }
  return {inherit};
});
