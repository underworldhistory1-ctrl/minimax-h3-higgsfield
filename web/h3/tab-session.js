/* A normal navigation starts a new video workspace; only reload resumes it. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else{
    root.H3TabSession=factory();
    root.H3TabSession.prepare(root.sessionStorage,root.performance.getEntriesByType('navigation')[0]?.type);
  }
})(globalThis,function(){
  'use strict';
  const videoKeys=new Set(['h3studio.client.id.v1','h3studio.session.id.v3','h3studio.session.v3','h3studio.draft.v3']);
  function prepare(storage,navigationType){
    if(navigationType==='reload')return;
    const remove=[];
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);
      if(videoKeys.has(key)||key?.startsWith('h3.tab.setup.')&&key.includes('/project/')||key?.startsWith('h3_lab.')&&(/\.active_project_id$/.test(key)||key.includes('.scene_scope.')))remove.push(key);
    }
    for(const key of remove)storage.removeItem(key);
  }
  return {prepare};
});
