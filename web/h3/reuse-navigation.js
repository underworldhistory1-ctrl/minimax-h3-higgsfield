(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.H3ReuseNavigation=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function link(href,output,requestId){
    const url=new URL(href);url.searchParams.delete('job');url.searchParams.delete('project');
    url.searchParams.set('reuse',output);url.searchParams.set('reuse_request',requestId);url.hash='studio';return url.href;
  }
  async function restore(controller,{href,replace}){
    const url=new URL(href),output=url.searchParams.get('reuse');if(!output)return null;
    let requestId=url.searchParams.get('reuse_request');
    if(!requestId){requestId=crypto.randomUUID();url.searchParams.set('reuse_request',requestId);replace(url.href);}
    const result=await controller.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:output,create_grouped:true,request_id:requestId})});
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
