(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.H3ReuseNavigation=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function link(href,output,requestId){
    const url=new URL(href);url.searchParams.delete('job');url.searchParams.delete('project');
    url.searchParams.set('reuse',output);url.searchParams.set('reuse_request',requestId);url.hash='studio';return url.href;
  }
  async function restore(controller,{href,storage,replace}){
    const url=new URL(href),output=url.searchParams.get('reuse');if(!output)return null;
    const prepared=await controller.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:output})});
    if(!prepared.available)throw Error((prepared.warnings||[]).join('\n')||'This video has no saved setup.');
    const key=controller._storageKey('reuse_navigation.'+(url.searchParams.get('reuse_request')||output));
    let target,id=storage.getItem(key);
    if(id){try{target=await controller.fetchJson('/h3_studio/lab/projects/'+encodeURIComponent(id));}catch(error){if(error.status!==404)throw error;}}
    if(!target){target=await controller.createProject('Reused · '+output.split('/').pop());storage.setItem(key,target.project_id);}
    const result=await controller.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:output,target_project_id:target.project_id,expected_revision:target.revision})});
    const project=await controller.loadProject(result.project.project_id);
    url.searchParams.delete('reuse');url.searchParams.delete('reuse_request');url.searchParams.set('project',project.project_id);url.hash='studio';replace(url.href);
    return project;
  }
  function projectLink(href,id){
    const url=new URL(href);
    // Reuse owns its request URL until its restoration transaction is complete.
    if(!url.searchParams.has('reuse'))url.searchParams.set('project',id);
    return url.href;
  }
  return {link,restore,projectLink};
});
