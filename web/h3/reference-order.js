/* Reordering preserves object identity and remaps native numeric references atomically. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.H3ReferenceOrder=factory();})(globalThis,function(){
  'use strict';
  function permutation(items,indices){
    if(indices.length!==items.length||new Set(indices).size!==items.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=items.length))throw Error('Reference order changed. Try the move again.');
    return indices.map(i=>items[i]);
  }
  function tagIdentities(refs){
    const map=new Map();let picture=0,video=0,audio=0,subject=0;const groups=new Map();
    for(const ref of refs.filter(r=>r.kind==='image')){
      map.set('Picture '+ ++picture,ref);
      if(['custom','storyboard','spatial plan'].includes(ref.role))continue;
      const identity=ref.subject_group?'group:'+ref.subject_group:ref;
      if(!groups.has(identity)){groups.set(identity,++subject);map.set('Subject '+subject,identity);}
    }
    for(const ref of refs.filter(r=>r.kind==='video')){map.set('Video '+ ++video,ref);if(ref.useAudio)map.set('Audio '+ ++audio,ref);}
    for(const ref of refs.filter(r=>r.kind==='audio'))map.set('Audio '+ ++audio,ref);
    return map;
  }
  function remap(text,before,after,{explicitSubjects=false}={}){
    const old=tagIdentities(before),next=tagIdentities(after),changes=new Map();
    for(const [tag,identity] of old){if(explicitSubjects&&tag.startsWith('Subject '))continue;const kind=tag.split(' ')[0],match=[...next].find(([candidate,value])=>candidate.startsWith(kind+' ')&&value===identity);if(match)changes.set(tag,match[0]);}
    return String(text||'').replace(/<(Picture|Video|Audio|Subject)\s+(\d+)>/gi,(whole,kind,index)=>'<'+(changes.get(kind[0].toUpperCase()+kind.slice(1).toLowerCase()+' '+Number(index))||kind+' '+index)+'>');
  }
  function remapQwen(text,before,after){return String(text||'').replace(/<image(\d+)>/gi,(whole,index)=>{const ref=before[Number(index)-1],target=after.indexOf(ref);return ref&&target>=0?'<image'+(target+1)+'>':whole;});}
  return {permutation,remap,remapQwen};
});
