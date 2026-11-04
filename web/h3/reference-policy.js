(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.H3ReferencePolicy=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const groupRoles={'character identity':'Character',location:'Environment',object:'Element','visual style':'Style',storyboard:'Storyboard sequence'};
  function canGroup(ref){return ref?.kind==='image'&&Object.hasOwn(groupRoles,ref.role);}
  function groupValue(ref){return ref?.role==='storyboard'?ref.storyboardGroup:ref?.subject_group;}
  function groupKey(ref){const value=groupValue(ref);return canGroup(ref)&&typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)?ref.role+':'+value:null;}
  function groupFields(ref){return ref.role==='storyboard'?{role:ref.role,storyboardGroup:ref.storyboardGroup,storyboardMode:ref.storyboardMode??'auto'}:{role:ref.role,subject_group:ref.subject_group};}
  function imageResize(ref,autoFit){return !!autoFit && ref?.useOriginalResolution !== true;}
  function previewRange(ref,sourceDuration){
    const source=Number(sourceDuration),start=ref.trimEnabled?Number(ref.trimStart):0;
    const duration=ref.trimEnabled?Number(ref.trimDuration):source;
    if(!Number.isFinite(start)||start<0||!Number.isFinite(duration)||duration<=0||!Number.isFinite(source)||source<=start)return null;
    const end=Math.min(source,start+duration);return {start,end,duration:end-start};
  }
  function sizingText(meta){
    if(!meta)return '';
    const width=meta.width??meta.image_width,height=meta.height??meta.image_height;
    const sourceWidth=meta.original_width??meta.source_width,sourceHeight=meta.original_height??meta.source_height;
    return [sourceWidth&&sourceHeight?'Original '+sourceWidth+'×'+sourceHeight:'',width&&height?'Prepared input '+width+'×'+height:'',meta.resized?'Wrapper resized this input':''].filter(Boolean).join(' · ');
  }
  return {imageResize,previewRange,sizingText,groupRoles,canGroup,groupKey,groupValue,groupFields};
});
