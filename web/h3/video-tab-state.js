/* This tab's working setup is independent of the explicitly saved server project. */
(function(){
  'use strict';
  let last='',running=false,again=false,failed=false,pending=Promise.resolve();
  const panel=document.createElement('div');panel.className='tip';
  const status=document.createElement('span');status.id='tabDraftStatus';status.setAttribute('role','status');status.textContent='This tab saves its working setup automatically.';
  const clear=document.createElement('button');clear.id='clearTabSetup';clear.className='button alt smallbtn';clear.type='button';clear.textContent='Clear setup';clear.title='Reset this working scene only; saved projects and videos remain';panel.append(status);$('projectNameDisplay').after(panel);const actions=document.createElement('div');actions.className='row';actions.append(clear);$('projectTools').append(actions);
  async function flush(force=false){
    clear.disabled=!!(state.busy||state.projectLoading);
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
  async function clearSetup(){
    if(state.busy||state.projectLoading)return;
    if(!confirm('Clear this working scene’s inputs and settings? Saved project setups and videos remain unchanged.'))return;
    try{
      await withProjectLoading(async()=>{await pending.catch(()=>{});state.tabDraftRestoreError=null;await hydrateProjectDraft({...emptyWorkspaceDraft(),scene_name:$('sceneName')?.value||''});});
      last='';await flush(true);if(failed)throw Error('The cleared setup could not be saved on this device. Retry before refreshing.');info('Working setup cleared. Saved scenes and videos remain.');
    }catch(error){status.textContent='Could not clear this setup: '+error.message;info(error.message,true);}
  }
  clear.onclick=clearSetup;
  let eventTimer;
  for(const type of ['input','change','click'])document.addEventListener(type,()=>{clearTimeout(eventTimer);eventTimer=setTimeout(flush,120);});
  setInterval(flush,750);
  setInterval(()=>flush(true),60000);
  addEventListener('pagehide',()=>{void flush();});
  addEventListener('beforeunload',event=>{if(state.reuseNavigating)return;void flush();if(running||failed){event.preventDefault();event.returnValue='';}});
  async function prepareReload(){
    if(state.projectLoading)throw Error('Wait for the working setup to finish loading.');
    await pending.catch(()=>{});await flush(true);
    while(running||again)await pending.catch(()=>{});
    if(failed||state.tabDraftRestoreError)throw Error('The working setup is not saved. Keep this tab open and retry.');
  }
  window.H3VideoTabState={flush,clear:clearSetup,settle:()=>pending.catch(()=>{}),prepareReload};
})();
