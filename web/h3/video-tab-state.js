/* This tab's working setup is independent of the explicitly saved server project. */
(function(){
  'use strict';
  let last='',running=false,again=false,failed=false,pending=Promise.resolve();
  const panel=document.createElement('div');panel.className='tip';
  const status=document.createElement('span');status.id='tabDraftStatus';status.setAttribute('role','status');status.textContent='This tab saves its working setup automatically.';
  const clear=document.createElement('button');clear.id='clearTabSetup';clear.className='button alt smallbtn';clear.type='button';clear.textContent='Clear this tab’s setup';panel.append(status,clear);$('projectNameDisplay').parentElement.append(panel);
  async function flush(force=false){
    clear.disabled=!!(state.busy||state.projectLoading||running);
    if(running){again=true;return;}
    if(state.projectLoading||!projectCtrl)return;
    if(state.tabDraftRestoreError){status.textContent='Working setup restore failed: '+state.tabDraftRestoreError+' Reload to retry, or explicitly clear this tab’s setup.';return;}
    const snapshot=captureProjectDraft(true),name=tabProjectDraftKey(state.activeProjectId||'unassigned'),signature=name+JSON.stringify(snapshot,(k,v)=>v instanceof Blob?[v.name,v.size,v.lastModified]:v);
    if(signature===last&&!force)return;
    running=true;status.textContent='Saving this tab’s setup…';
    try{pending=H3TabDraftStore.save(name,snapshot);await pending;last=signature;failed=false;status.textContent=(projectCtrl.draftScope?.shot_id?'This shot’s setup':'This tab’s setup')+' is saved · refresh keeps inputs.';}
    catch(e){failed=true;status.textContent='Setup not saved: '+e.message;}
    finally{running=false;if(again){again=false;void flush();}}
  }
  clear.onclick=async()=>{
    if(state.busy||state.projectLoading||running)return;
    if(!confirm('Clear this tab’s production inputs and settings? Saved project materials and videos remain.'))return;
    state.tabDraftRestoreError=null;
    await withProjectLoading(()=>hydrateProjectDraft({mode:'text',prompts:{text:'',frames:'',refs:''},refs:[],guides:[],settings:{duration:'124',durationSeconds:'5.167',steps:'20',seed:'42',renderMethod:'native'},canvas:{width:1344,height:768}}));
    last='';await flush();
  };
  for(const type of ['input','change','click'])document.addEventListener(type,()=>{setTimeout(flush,0);});
  setInterval(flush,750);
  setInterval(()=>flush(true),60000);
  addEventListener('pagehide',()=>{void flush();});
  addEventListener('beforeunload',event=>{void flush();if(running||failed){event.preventDefault();event.returnValue='';}});
  window.H3VideoTabState={flush,settle:()=>pending.catch(()=>{})};
})();
