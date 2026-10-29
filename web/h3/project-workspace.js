"use strict";
// Project catalog and navigation share the existing controller and native reference compiler.
function workspaceElement(tag,text,className){
  const element=document.createElement(tag);if(text!==undefined)element.textContent=text;
  if(className)element.className=className;return element;
}
function workspaceButton(text,action){const button=workspaceElement('button',text,'button alt smallbtn');button.type='button';button.onclick=()=>Promise.resolve().then(action).catch(error=>info(error.message,true));return button;}
function projectOpenAction(project){
  const link=workspaceElement('a','Open','button project-open'),url=new URL(location.href);
  for(const key of ['job','reuse','reuse_request','api_base'])url.searchParams.delete(key);
  url.searchParams.set('project',project.project_id);url.hash='studio';
  // A noopener tab has fresh sessionStorage: carry this tab's selected server.
  url.searchParams.set('api_base',projectCtrl?.apiBase||'');
  link.href=url.href;link.target='_blank';link.rel='noopener';link.dataset.projectOpen=project.project_id;
  link.title='Open project. During rendering or loading, opens in a separate tab.';
  link.onclick=event=>{
    if(workspaceLocked()||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;
    event.preventDefault();return openProjectWorkspace(project.project_id).catch(error=>info(error.message,true));
  };
  return link;
}
let workspaceCatalogBusy=false;
let catalogPage={key:'',limit:60},catalogSearchTimer;
function workspaceLocked(){return state.busy||state.projectLoading||workspaceCatalogBusy;}
function projectCatalogItems(){
  return (state.currentProject?.assets||[]).filter(asset=>asset.asset_id&&asset.alias).map(asset=>({
    ...asset,assetId:asset.asset_id,label:asset.name||asset.alias,tag:state.currentProject.asset_categories?.find(c=>c.id===asset.category)?.name||'Custom',
    previewUrl:asset.kind!=='image'?null:projectCtrl.apiUrl(`/h3_studio/lab/assets/${encodeURIComponent(asset.asset_id)}/thumbnail`),catalog:true,
  }));
}
async function workspaceMutation(operation,project=state.currentProject){
  if(!project||workspaceLocked())throw Error('Wait for the current project operation to finish.');
  const controller=projectCtrl;
  workspaceCatalogBusy=true;renderProjectCatalog();
  try{
    const updated=await controller.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(project.project_id)}/workspace`,{
      method:'POST',body:JSON.stringify({operation,expected_revision:project.revision}),
    });
    if(controller!==projectCtrl)return;
    if(state.currentProject?.project_id===updated.project_id){controller.currentProject=updated;updateProjectUI(updated);}
    if(workspaceView==='projects')await renderProjectHub();return updated;
  }catch(error){
    if(error.status===409&&controller===projectCtrl){
      if(state.currentProject?.project_id===project.project_id)await controller.loadProject(project.project_id);
      throw Error('This project changed on another device. The catalog has refreshed; try the edit again.');
    }
    throw error;
  }finally{workspaceCatalogBusy=false;renderProjectCatalog();}
}
async function saveWorkspaceDraft(){
  if(!projectCtrl?.currentProject)return;
  if(typeof H3VideoTabState!=='undefined')await H3VideoTabState.settle();
  if(typeof H3TabDraftStore!=='undefined')await H3TabDraftStore.save(tabProjectDraftKey(state.activeProjectId),captureProjectDraft(true));
  // An empty scene has no shot draft to persist; its local checkpoint remains available.
  if(projectCtrl.draftScope?.scene_id&&!projectCtrl.draftScope.shot_id)return;
  const snapshot=captureProjectDraft(),project=projectCtrl.currentProject;
  const saved=typeof H3Scenes!=='undefined'?H3Scenes.draft(project,projectCtrl.draftScope):project.draft;
  const signature=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  const rootCanvas=projectCtrl.draftScope?.scene_id?{}:{canvas:{width:state.width,height:state.height},fps:24};
  const sameCanvas=projectCtrl.draftScope?.scene_id||(project.canvas?.width===state.width&&project.canvas?.height===state.height);
  if(allInputItems().every(item=>item.assetId)&&signature(snapshot)===signature(saved)&&sameCanvas)return;
  const draft=await persistProjectDraft();await projectCtrl.saveCurrentProject({...rootCanvas,draft,assets:mergeProjectAssetDescriptors(projectCtrl.currentProject.assets||[],allInputItems())});
}
async function openProjectWorkspace(id,{view='studio'}={}){
  if(workspaceLocked())throw Error('Wait for the current operation before changing projects.');
  if(id===state.activeProjectId){setWorkspaceView(view);return;}
  $('projectHubStatus').textContent='Opening project · restoring saved references…';
  await withProjectLoading(async()=>{
    if(projectCtrl.currentProject)await saveWorkspaceDraft();
    const project=await projectCtrl.loadProject(id);state.currentClipId=null;
    await hydrateWorkspaceDraft(project);
    state.current=null;state.visibleResults=16;$('videoActionsDialog').close();$('upscaleStatus').textContent='';showStageMessage('Project workspace',project.name);renderResults();
  });
  document.body.classList.remove('project-hub-open');setWorkspaceView(view);renderProjectCatalog();refreshLabControls();
}
async function showProjectHub(save=true){
  if(state.projectLoading||workspaceCatalogBusy)throw Error('Wait for the current project operation to finish.');
  if(save&&projectCtrl?.currentProject&&!state.busy)await withProjectLoading(saveWorkspaceDraft);
  document.body.classList.add('project-hub-open');setWorkspaceView('projects');await renderProjectHub();
}
let projectHubEpoch=0;
async function renderProjectHub(){
  const epoch=++projectHubEpoch;
  const controller=projectCtrl,list=$('projectHubList');if(!controller||!list)return;
  const response=await controller.listProjects();if(controller!==projectCtrl||epoch!==projectHubEpoch)return;
  if(typeof H3OrganizationUI!=='undefined'){await H3OrganizationUI.renderProjects(response.projects||[],list);return;}
  list.replaceChildren();
  for(const project of response.projects||[]){
    const card=workspaceElement('article',undefined,'project-card');card.dataset.projectId=project.project_id;
    card.append(workspaceElement('h2',project.name),workspaceElement('p',`${project.asset_count||0} assets · ${project.take_count||0} takes`,'tip'));
    const actions=workspaceElement('div',undefined,'row');
    actions.append(projectOpenAction(project),workspaceButton('Rename',async()=>{
      const name=prompt('Project name',project.name);if(name?.trim())await workspaceMutation({action:'rename_project',name},project);
    }));card.append(actions);list.append(card);
  }
  $('projectHubStatus').textContent=list.children.length?'':'Create your first project. Assets and shot settings stay with it.';
}
async function activateProjectAsset(item){
  if(workspaceLocked())throw Error('Wait for the current operation to finish.');
  if(!state.currentProject?.assets?.some(asset=>asset.asset_id===item.assetId))throw Error('This element is not in the active project.');
  const existing=state.refs.find(ref=>ref.assetId===item.assetId);
  if(existing){
    const prompt=$('prompt').value,mode=state.mode;
    selectMode('refs');if(state.mode!=='refs')throw Error('References mode is unavailable.');
    if(mode!=='refs'){state.prompts.refs=prompt;$('prompt').value=prompt;saveDraft();}
    return existing;
  }
  if(state.refs.length>=12||state.refs.filter(ref=>ref.kind===item.kind).length>=maxRefs[item.kind]||
    item.kind==='audio'&&state.refs.filter(ref=>ref.kind==='audio'||ref.kind==='video'&&ref.useAudio).length>=3)
    throw Error('This shot has reached the H3 reference limit. Remove a shot reference first; the project asset will stay saved.');
  if(state.refs.some(ref=>ref.alias.toLocaleLowerCase()===item.alias.toLocaleLowerCase()))
    throw Error('This alias is already used by another shot reference. Rename that reference before adding the project asset.');
  const referenceCheckpoint=state.modelProfile&&state.modelProfile!=='original'?selectedCheckpoint():modelRef;
  if(state.continuation?.type==='generated'&&state.continuation.source_model!==referenceCheckpoint)
    throw Error('Use Active continuation → References to re-encode this source before adding project references.');
  const controller=projectCtrl,pid=state.activeProjectId,initialMode=state.mode,initialPrompt=$('prompt').value;workspaceCatalogBusy=true;
  let url;
  try{
    const [record,blob]=await Promise.all([controller.getAsset(item.assetId),controller.mediaBlob(item.assetId)]);
    if(controller!==projectCtrl||pid!==state.activeProjectId)throw Error('Project changed while loading the asset.');
    if(state.mode!==initialMode||$('prompt').value!==initialPrompt)throw Error('The prompt changed while loading the element. Select it again to attach it.');
    // Readiness gates apply before committing a reference, including selected checkpoint compatibility.
    selectMode('refs');if(state.mode!=='refs')throw Error('References mode is unavailable on this server.');
    if(initialMode!=='refs'){state.prompts.refs=initialPrompt;$('prompt').value=initialPrompt;}
    url=URL.createObjectURL(blob);
    const videoMeta=record?.metadata||item.metadata||{};
    const ref={assetId:item.assetId,file:new File([blob],record.original_name||item.alias,{type:blob.type}),kind:item.kind,alias:item.alias,
      label:item.label||item.name||item.alias,name:item.name||item.label||item.alias,
      mention_names:item.mention_names||[],
      role:item.role||(item.kind==='image'?'character identity':item.kind==='video'?'motion':'voice'),
      previewUrl:item.kind==='audio'?null:url,url,useAudio:false,trimEnabled:false,trimStart:0,trimDuration:15,fitVideo:true,instruction:item.notes||'',
      meta:item.kind==='video'?{fps:24,frame_count:videoMeta.frame_count||120,duration:videoMeta.duration||5,...videoMeta}:(record?.metadata||{}),
      fps:item.kind==='video'?24:undefined,frame_count:item.kind==='video'?(videoMeta.frame_count||120):undefined,duration:item.kind==='video'?(videoMeta.duration||5):undefined};
    if(item.kind==='audio'){
      const audio=document.createElement('audio');audio.preload='metadata';audio.src=url;
      audio.onloadedmetadata=()=>{if(state.refs.includes(ref)){ref.localDuration=audio.duration;renderRefs();}};
    }
    if(item.kind==='video'){
      const vid=document.createElement('video');vid.preload='metadata';vid.src=url;
      vid.onloadedmetadata=()=>{
        if(Number.isFinite(vid.duration)&&vid.duration>0){
          ref.localDuration=vid.duration;
          if(!ref.meta)ref.meta={fps:24};
          if(!ref.meta.duration)ref.meta.duration=vid.duration;
          if(!ref.meta.frame_count)ref.meta.frame_count=Math.round(vid.duration*24);
          ref.frame_count=ref.meta.frame_count;
          renderRefs();
        }
      };
    }
    state.refs.push(ref);url=null;renderRefs();renderEstimates();saveDraft();return ref;
  }finally{if(url)URL.revokeObjectURL(url);workspaceCatalogBusy=false;renderProjectCatalog();}
}
let syncMentionsTimer=null,syncMentionsPending=null;
function syncPromptMentionsToReferences(){
  if(syncMentionsPending)return syncMentionsPending;
  if(!state.currentProject?.assets||workspaceLocked())return Promise.resolve();
  const pid=state.activeProjectId;
  syncMentionsPending=(async()=>{
    const attachedIds=new Set(state.refs.map(ref=>ref.assetId));
    const attachedAliases=new Set(state.refs.map(ref=>ref.alias.toLocaleLowerCase()));
    const catalog=projectCatalogItems().filter(ref=>!attachedIds.has(ref.assetId)&&!attachedAliases.has(ref.alias.toLocaleLowerCase()));
    const text=H3PromptCompiler.normalizeReferenceMentions($('prompt').value||'',[...catalog,...state.refs]);
    const mentions=new Set([...text.matchAll(/@([\p{L}\p{N}_-]+)/gu)].map(match=>match[1].toLocaleLowerCase()));
    for(const item of catalog){
      if(pid!==state.activeProjectId)return;
      if(mentions.has(item.alias.toLocaleLowerCase())&&!state.refs.some(ref=>ref.assetId===item.assetId))await activateProjectAsset(item);
    }
  })().finally(()=>{syncMentionsPending=null;});
  return syncMentionsPending;
}
function queueSyncPromptMentions(){
  clearTimeout(syncMentionsTimer);
  syncMentionsTimer=setTimeout(()=>syncPromptMentionsToReferences().catch(error=>info(error.message,true)),200);
}
async function insertProjectMention(item,range=null){
  const input=$('prompt'),start=range?.start??input.selectionStart,end=range?.end??input.selectionEnd;
  const pid=state.activeProjectId,initialPrompt=input.value,alreadyAttached=state.refs.some(ref=>ref.assetId===item.assetId);
  const ref=item.catalog?await activateProjectAsset(item):item;
  if(pid!==state.activeProjectId)throw Error('Project changed before inserting the reference.');
  if(input.value!==initialPrompt){
    if(item.catalog&&!alreadyAttached){state.refs=state.refs.filter(candidate=>candidate!==ref);if(ref.url)URL.revokeObjectURL(ref.url);renderRefs();saveDraft();}
    throw Error('The prompt changed while loading the element. Select it again to insert it.');
  }
  const catalog=projectCatalogItems(),preferred=H3PromptCompiler.mentionName(item);
  const token='@'+preferred;
  let name=ref.alias;
  try{if(H3PromptCompiler.normalizeReferenceMentions(token,catalog.length?catalog:[ref])==='@'+ref.alias)name=preferred;}catch{}
  input.setRangeText('@'+name+' ',Math.min(start,input.value.length),Math.min(end,input.value.length),'end');
  $('mentionMenu').classList.add('hidden');input.focus();renderPromptAssets();saveDraft();
}
function refreshProjectHubControls(){
  const locked=workspaceLocked();
  $('projectSelect').disabled=locked;
  for(const id of ['btnNewProject','projectHubCreate','newProjectFolder','newProjectName'])if($(id))$(id).disabled=locked;
  for(const id of ['btnSaveProject','btnExportProject'])if($(id))$(id).disabled=locked||!state.currentProject;
  for(const button of $('projectHubList')?.querySelectorAll('button')||[])button.disabled=button.dataset.browseFolder?false:locked;
}
function renderProjectCatalog(){
  refreshProjectHubControls();
  if(typeof H3ScenesUI!=='undefined')H3ScenesUI.render();
  const list=$('projectAssetList');if(!list)return;list.replaceChildren();
  const project=state.currentProject;
  if(typeof H3OrganizationUI!=='undefined')H3OrganizationUI.assetTools();
  $('workspaceName').textContent=project?.name||'Choose a project';
  if($('workspaceProjectLabel'))$('workspaceProjectLabel').textContent=project?.name||'Choose a project';
  for(const id of ['assetUpload','addAssetCategory','renameAssetCategory','assetDropzone'])$(id).disabled=!project||workspaceLocked();
  if(!project)return;
  const selected=$('assetCategory').value;
  $('assetCategory').replaceChildren();
  for(const category of project.asset_categories||[]){const option=workspaceElement('option',category.name);option.value=category.id;$('assetCategory').append(option);}
  if([...$('assetCategory').options].some(option=>option.value===selected))$('assetCategory').value=selected;
  const search=$('assetSearch').value.toLocaleLowerCase();
  const requestedFilter=$('assetFilter')?.value||'all',filter=project.asset_categories.some(c=>c.id===requestedFilter)?requestedFilter:'all',kind=$('assetKindFilter')?.value||'all';
  const filterNode=$('assetFilter');if(filterNode){filterNode.replaceChildren();for(const category of [{id:'all',name:'All categories'},...project.asset_categories]){const option=workspaceElement('option',category.name);option.value=category.id;filterNode.append(option);}filterNode.value=project.asset_categories.some(c=>c.id===filter)?filter:'all';}
  const folder=$('assetFolderFilter')?.value||'all';
  const items=projectCatalogItems().filter(item=>(filter==='all'||item.category===filter)&&(kind==='all'||item.kind===kind)&&(folder==='all'||(folder==='unfiled'?!item.folder_id:item.folder_id===folder))&&[item.label,item.alias,item.notes||''].some(value=>value.toLocaleLowerCase().includes(search)));
  if($('assetSort')?.value==='name')items.sort((a,b)=>a.label.localeCompare(b.label));
  const pageKey=JSON.stringify([project.project_id,search,filter,kind,folder,$('assetSort')?.value]);
  if(catalogPage.key!==pageKey)catalogPage={key:pageKey,limit:60};
  const visible=items.slice(0,catalogPage.limit);
  $('assetLibraryCount').textContent=visible.length+' / '+items.length+' shown · '+project.assets.length+' in project';
  for(const item of visible){
    const row=workspaceElement('article',undefined,'catalog-asset');
    if(typeof H3OrganizationUI!=='undefined')H3OrganizationUI.assetSelection(item,row);
    if(item.kind==='image'){const image=workspaceElement('img');image.src=item.previewUrl;image.alt=item.label;image.loading='lazy';image.decoding='async';image.onerror=()=>image.replaceWith(workspaceElement('span','Image','asset-kind'));row.append(image);}
    else row.append(workspaceElement('span',item.kind==='audio'?'♫':'▶','asset-kind'));
    const description=workspaceElement('div',undefined,'catalog-description');description.append(workspaceElement('strong',item.label),workspaceElement('small','@'+item.alias+' · '+item.tag+' · '+item.kind));row.append(description);
    const actions=workspaceElement('div',undefined,'catalog-actions');
    const use=workspaceButton('Use',()=>insertProjectMention(item).then(()=>setWorkspaceView('studio')));use.disabled=workspaceLocked();
    const preview=workspaceButton('Preview',()=>previewProjectAsset(item));preview.disabled=workspaceLocked();
    const edit=workspaceButton('Edit',()=>editProjectAsset(item));edit.disabled=workspaceLocked();actions.append(preview,use,edit);if(item.kind==='image'){const replace=workspaceButton('Replace image',()=>requestElementReplacement(item));replace.disabled=workspaceLocked();replace.title='Replace this element in editable setups; existing takes keep their original image.';actions.append(replace);}row.append(actions);list.append(row);
  }
  if(items.length>visible.length){const more=workspaceButton('Show next 60 elements',()=>{catalogPage.limit+=60;renderProjectCatalog();});more.classList.add('catalog-more');list.append(more);}
  if(!items.length){const empty=workspaceElement('div','No assets here yet. Choose an upload category and add your files, or change the filters.','asset-library-empty');list.append(empty);}

}
function editProjectAsset(item){
  const dialog=$('assetEditDialog');dialog.dataset.assetId=item.assetId;dialog.dataset.projectId=state.activeProjectId;dialog.dataset.revision=state.currentProject.revision;
  $('assetEditStatus').textContent='';$('assetEditName').value=item.label;$('assetEditNotes').value=item.notes||'';
  const updateAliasPreview=()=>{
    const custom=$('assetEditName').value.trim();
    const alias=H3PromptCompiler.mentionName({name:custom,alias:item.alias});
    $('assetEditAlias').textContent='Suggested name: @'+alias+' · Stable identifier: @'+item.alias;
  };
  $('assetEditName').oninput=updateAliasPreview;
  updateAliasPreview();
  $('assetEditCategory').replaceChildren();for(const category of state.currentProject.asset_categories){const option=workspaceElement('option',category.name);option.value=category.id;$('assetEditCategory').append(option);}
  $('assetEditCategory').value=item.category;dialog.showModal();
}
function referenceMutationLocked(){return workspaceLocked();}
function pickReplacementImage(action){
  if(workspaceLocked())return;
  const picker=document.createElement('input');picker.type='file';picker.accept='.png,.jpg,.jpeg,.webp';
  picker.onchange=()=>{const file=picker.files[0];if(file)Promise.resolve(action(file)).catch(error=>info(error.message,true));};
  picker.click();
}
async function verifyReplacementImage(file){
  if(!mediaRules.image.ext.test(file.name)||!file.size||file.size>mediaRules.image.max)throw Error('Choose a non-empty PNG, JPEG or WebP image up to 25 MB.');
  const url=URL.createObjectURL(file);
  try{
    await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth*image.naturalHeight<=40000000?resolve():reject(Error('Image exceeds 40 megapixels.'));image.onerror=()=>reject(Error('The image cannot be decoded. Your original reference is unchanged.'));image.src=url;});
  }finally{URL.revokeObjectURL(url);}
}
function swapReferenceImage(ref,file,assetId=null){
  const previous=new Set([ref.url,ref.previewUrl,ref.originalPreviewUrl]);
  for(const key of ['url','previewUrl','originalPreviewUrl','meta','uploadProgress','uploadReady','restoreError','localDuration'])delete ref[key];
  ref.file=file;ref.assetId=assetId;ref.url=ref.previewUrl=URL.createObjectURL(file);
  for(const url of previous)if(url)URL.revokeObjectURL(url);
}
function requestReferenceReplacement(ref){pickReplacementImage(file=>replaceShotReference(ref,file));}
async function replaceShotReference(ref,file){
  if(workspaceLocked()||!state.refs.includes(ref))throw Error('Finish the current operation before replacing this reference.');
  const controller=projectCtrl,pid=state.activeProjectId;
  await withProjectLoading(async()=>{
    await verifyReplacementImage(file);
    if(controller!==projectCtrl||pid!==state.activeProjectId||!state.refs.includes(ref))throw Error('The project changed. Select the reference again.');
    swapReferenceImage(ref,file);
    try{await updateRefFitPreview(ref);}catch(error){info('Image replaced; fit preview unavailable: '+error.message,true);}
    syncRestoredInputStatus();saveDraft();
  });
  renderRefs();updatePreviewLive();info('Reference replaced in this shot. Its mention name and position are unchanged. Save setup to retain it on the server.');
}
function requestElementReplacement(item){pickReplacementImage(file=>replaceProjectElement(item,file));}
async function replaceProjectElement(item,file){
  if(workspaceLocked()||!state.currentProject?.assets.some(asset=>asset.asset_id===item.assetId))throw Error('Select an element in the current project first.');
  const controller=projectCtrl,project=state.currentProject;
  try{await withProjectLoading(async()=>{
    await verifyReplacementImage(file);
    $('assetUploadStatus').textContent='Uploading replacement for '+item.label+'…';
    const asset=await controller.uploadAsset(file,null);
    if(controller!==projectCtrl||state.activeProjectId!==project.project_id)throw Error('The project changed. The original element is unchanged.');
    let updated;
    try{
      updated=await controller.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(project.project_id)}/workspace`,{method:'POST',body:JSON.stringify({operation:{action:'replace_asset',asset_id:item.assetId,replacement_id:asset.asset_id},expected_revision:project.revision})});
    }catch(error){
      // The server may have committed before its response was lost. Read back
      // the exact swap once; never retry a mutation or overwrite a different edit.
      if(error.status&&error.status<500)throw error;
      const latest=await controller.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(project.project_id)}`).catch(()=>null);
      if(!latest?.assets.some(entry=>entry.asset_id===asset.asset_id&&entry.alias===item.alias)||
        item.assetId!==asset.asset_id&&latest.asset_replacements?.[item.assetId]!==asset.asset_id)throw error;
      updated=latest;
    }
    if(controller!==projectCtrl||state.activeProjectId!==project.project_id)throw Error('The project changed. Reopen it to see the saved replacement.');
    for(const ref of allInputItems())if(ref.assetId===item.assetId)swapReferenceImage(ref,file,asset.asset_id);
    controller.currentProject=updated;updateProjectUI(updated);syncRestoredInputStatus();saveDraft();
    if(typeof H3TabDraftStore!=='undefined')try{await H3TabDraftStore.save(tabProjectDraftKey(project.project_id),captureProjectDraft(true));}catch(error){info('Image saved on the server; this tab could not save its local setup: '+error.message,true);}
    $('assetUploadStatus').textContent='Image replaced. Element name and saved shot bindings are retained.';
  });}catch(error){
    $('assetUploadStatus').textContent='Replacement did not finish: '+error.message;
    if(error.status===409&&controller===projectCtrl&&state.activeProjectId===project.project_id)await controller.loadProject(project.project_id);
    throw error;
  }
  await Promise.all([renderFrameItem('first'),renderFrameItem('last'),...state.refs.filter(ref=>ref.kind==='image').map(ref=>updateRefFitPreview(ref).catch(error=>info(error.message,true)))]);renderGuides();if(window.H3ConnectedStudio)H3ConnectedStudio.restoreControl();
  renderRefs();renderProjectCatalog();updatePreviewLive();
}
function rebaseWorkspaceAssets(draft,project){
  if(!draft||draft.reuse_source||!project?.asset_replacements)return draft;
  const result={...draft},replacements=project.asset_replacements,currentIds=new Set((project.assets||[]).map(asset=>asset.asset_id));
  const rebase=ref=>{
    if(!ref)return ref;
    let id=ref.assetId;const seen=new Set();
    while(!currentIds.has(id)&&replacements[id]&&!seen.has(id)){seen.add(id);id=replacements[id];}
    if(id===ref.assetId)return ref;
    const next={...ref,assetId:id};for(const key of ['file','url','previewUrl','originalPreviewUrl','meta','restoreError','uploadReady'])delete next[key];return next;
  };
  for(const key of ['first','last'])result[key]=rebase(draft[key]);
  for(const key of ['refs','guides'])result[key]=(draft[key]||[]).map(rebase);
  result.controlInputs=Object.fromEntries(Object.entries(draft.controlInputs||{}).map(([key,ref])=>[key,rebase(ref)]));
  return result;
}
async function createWorkspaceProject(name){
  if(workspaceLocked()||!projectCtrl)return;
  name=name?.trim();if(!name)return;
  await withProjectLoading(async()=>{
    await saveWorkspaceDraft();
    const blank=emptyWorkspaceDraft();
    let project=await projectCtrl.createProject(name,blank.canvas);
    try{project=await H3OrganizationUI.fileNewProject(project);}catch(error){info('Project created, but moving it to the selected folder failed: '+error.message,true);}
    H3ScenesUI.restore(project);state.current=null;state.currentClipId=null;
    await hydrateProjectDraft(blank);updateProjectUI(project);
  });
  setWorkspaceView('studio');$('videoActionsDialog').close();showStageMessage('Project workspace',name);$('newProjectName').value='';
}
async function saveWorkspaceSetup(){
  if(workspaceLocked()||!projectCtrl?.currentProject)return;
  requireWorkspaceShot();
  await withProjectLoading(saveWorkspaceDraft);syncRestoredInputStatus();
  info(state.restoreMissing.length?'Setup saved; some restored inputs still need attention.':'Setup saved.');
}
async function exportWorkspaceProject(){
  if(workspaceLocked()||!projectCtrl?.currentProject)return;
  requireWorkspaceShot();
  await withProjectLoading(async()=>{
    await saveWorkspaceDraft();
    const link=document.createElement('a');link.href=await projectCtrl.exportBundle();link.download='';document.body.append(link);link.click();link.remove();
  });
}
function requireWorkspaceShot(){if(projectCtrl.draftScope?.scene_id&&!projectCtrl.draftScope.shot_id)throw Error('Create or select a shot in this scene before saving or exporting its setup. Your local inputs are retained.');}
function initProjectWorkspace(){
  H3ScenesUI.init();
  $('btnNewProject').onclick=async()=>{try{if(workspaceLocked())return;const name=await H3OrganizationUI.askName('New project');if(name)await createWorkspaceProject(name);}catch(error){info(error.message,true);}};
  $('btnSaveProject').onclick=()=>saveWorkspaceSetup().catch(error=>info(error.message,true));
  $('btnExportProject').onclick=()=>exportWorkspaceProject().catch(error=>info(error.message,true));
  $('projectsHome').onclick=()=>showProjectHub().catch(error=>info(error.message,true));
  $('projectHubRefresh').onclick=()=>renderProjectHub().catch(error=>{$('projectHubStatus').textContent=error.message;});
  $('projectHubCreate').onclick=async()=>{
    if(workspaceLocked()||!projectCtrl)return;
    const name=$('newProjectName').value.trim();if(!name){$('newProjectName').focus();return;}
    try{await createWorkspaceProject(name);}
    catch(error){$('projectHubStatus').textContent=error.message;}
  };
  $('newProjectName').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();$('projectHubCreate').click();}});
  $('assetSearch').oninput=()=>{clearTimeout(catalogSearchTimer);catalogSearchTimer=setTimeout(renderProjectCatalog,120);};
  $('assetFilter').onchange=renderProjectCatalog;
  $('renameAssetCategory').onclick=()=>{const id=$('assetCategory').value,category=state.currentProject?.asset_categories.find(c=>c.id===id);if(!category)return;const name=prompt('Category name',category.name);if(name?.trim())workspaceMutation({action:'rename_category',category:id,name}).catch(error=>info(error.message,true));};$('assetKindFilter').onchange=renderProjectCatalog;
  $('addAssetCategory').onclick=()=>{const name=prompt('New asset category');if(name?.trim())workspaceMutation({action:'add_category',name}).catch(error=>info(error.message,true));};
  $('assetUpload').onclick=()=>{if(!workspaceLocked())$('projectAssetFiles').click();};
  async function uploadCatalogFiles(files){
    const controller=projectCtrl,pid=state.activeProjectId,category=$('assetCategory').value;
    if(!pid||workspaceLocked())return;workspaceCatalogBusy=true;renderProjectCatalog();
    try{
      let done=0;for(const file of files){
        await controller.uploadAsset(file,pid,{category,name:file.name});
        $('assetUploadStatus').textContent=`Saved ${++done}/${files.length} assets`;
      }
    }catch(error){$('assetUploadStatus').textContent=error.message;}
    finally{
      $('projectAssetFiles').value='';
      try{
        if(controller===projectCtrl&&pid===state.activeProjectId){
          const updated=await controller.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(pid)}`);
          if(controller===projectCtrl&&pid===state.activeProjectId){controller.currentProject=updated;updateProjectUI(updated);}
        }
      }catch(error){$('assetUploadStatus').textContent='Files may be saved; catalog refresh failed: '+error.message;}
      finally{workspaceCatalogBusy=false;renderProjectCatalog();}
    }
  };
  $('projectAssetFiles').onchange=()=>uploadCatalogFiles([...$('projectAssetFiles').files]);
  const drop=$('assetDropzone');drop.ondragover=event=>{event.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=event=>{event.preventDefault();drop.classList.remove('dragging');uploadCatalogFiles([...event.dataTransfer.files]).catch(error=>info(error.message,true));};drop.onclick=()=>$('assetUpload').click();
  $('assetEditSave').onclick=async()=>{
    if($('assetEditSave').disabled)return;
    const dialog=$('assetEditDialog');if(dialog.dataset.projectId!==state.activeProjectId){$('assetEditStatus').textContent='Project changed. Close this dialog and select the element again.';return;}
    $('assetEditSave').disabled=true;
    try{await workspaceMutation({action:'edit_asset',asset_id:$('assetEditDialog').dataset.assetId,name:$('assetEditName').value,category:$('assetEditCategory').value,notes:$('assetEditNotes').value},{project_id:dialog.dataset.projectId,revision:Number(dialog.dataset.revision)});$('assetEditDialog').close();}
    catch(error){$('assetEditStatus').textContent=error.message;if(state.activeProjectId===dialog.dataset.projectId)dialog.dataset.revision=state.currentProject.revision;}
    finally{$('assetEditSave').disabled=false;}
  };
  $('assetEditClose').onclick=()=>$('assetEditDialog').close();
  $('libraryScope').onchange=()=>{state.visibleResults=16;renderResults();};
  $('projectSelect').onchange=()=>{if($('projectSelect').value)openProjectWorkspace($('projectSelect').value,{view:workspaceView==='elements'?'elements':'studio'}).catch(error=>{$('projectSelect').value=state.activeProjectId||'';info(error.message,true);});};
  renderProjectCatalog();renderProjectHub().catch(error=>{$('projectHubStatus').textContent=error.message;});
}

let workspaceView='projects';
function setWorkspaceView(view,{history=true}={}){
  if(!['projects','studio','elements','generations','favorites','activity'].includes(view))view='projects';
  if(!state.currentProject&&view==='elements')view='projects';
  workspaceView=view;document.body.dataset.workspaceView=view;
  const pickerHome=view==='elements'?$('elementsProjectSwitcher'):$('projectPickerHome');
  pickerHome.append($('workspaceProjectPicker'));
  document.querySelector('label[for=projectSelect]').textContent=view==='elements'?'CURRENT PROJECT':'OPEN SAVED PROJECT';
  document.querySelector('.topnav a[href="index.html"]')?.classList.toggle('active',view==='studio');
  document.body.classList.toggle('project-hub-open',view==='projects');
  document.querySelectorAll('[data-workspace-nav]').forEach(button=>{const active=button.dataset.workspaceNav===view;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
  $('workspaceProjectLabel').textContent=state.currentProject?.name||'Choose a project';
  $('workspacePageTitle').textContent=({projects:'Projects',studio:'Production',elements:'Project elements',generations:'Generations',favorites:'Favorites',activity:'Activity'})[view];
  if(history&&location.hash!=='#'+view)window.history.pushState(null,'','#'+view);
  if((view==='projects'||view==='elements')&&projectCtrl)refreshProjectList().catch(error=>info(error.message,true));
  if(view==='elements')renderProjectCatalog();
  if(view==='generations'||view==='favorites')renderResults();
}
async function navigateWorkspace(view){
  if(view==='projects')return showProjectHub();
  setWorkspaceView(view);
}
function previewProjectAsset(item){
  const dialog=$('assetPreviewDialog'),content=$('assetPreviewContent');content.replaceChildren();
  $('assetPreviewTitle').textContent=item.label;
  $('assetPreviewInfo').textContent='@'+item.alias+' · '+item.tag+' · '+item.role;
  const media=document.createElement(item.kind==='image'?'img':item.kind==='video'?'video':'audio');
  media.src=projectCtrl.apiUrl(`/h3_studio/lab/assets/${encodeURIComponent(item.assetId)}/file`);
  if(item.kind==='image')media.alt=item.label;else{media.controls=true;media.preload='metadata';}
  content.append(media);$('assetPreviewUse').onclick=()=>insertProjectMention(item).then(()=>{dialog.close();setWorkspaceView('studio');}).catch(error=>info(error.message,true));
  dialog.showModal();
}
function initWorkspaceNavigation(){
  const createLink=document.querySelector('.topnav a[href="index.html"]');if(createLink)createLink.onclick=event=>{event.preventDefault();setWorkspaceView('studio');};
  const projectPicker=$('projectSelect').parentElement;const pickerLabel=document.querySelector('label[for=projectSelect]');const pickerGroup=workspaceElement('div',undefined,'workspace-project-picker');pickerGroup.id='workspaceProjectPicker';pickerGroup.append(pickerLabel,projectPicker);projectPicker.querySelector('select').setAttribute('aria-label','Current project');const hubControls=workspaceElement('details',undefined,'project-hub-tools');hubControls.id='projectPickerHome';hubControls.append(workspaceElement('summary','Open or import an existing project'),pickerGroup,$('projectBundleFile'));$('projectHubStatus').before(hubControls);
  const rail=workspaceElement('nav',undefined,'workspace-rail');rail.setAttribute('aria-label','Production navigation');
  const project=workspaceElement('div',undefined,'rail-project');project.append(workspaceElement('small','Current project'),workspaceElement('strong','Choose a project'));project.lastChild.id='workspaceProjectLabel';rail.append(project);
  for(const [view,label,icon] of [['projects','Projects','▦'],['studio','Production','◉'],['elements','Elements','▧'],['generations','Generations','▶'],['favorites','Favorites','☆'],['activity','Activity','◷']]){
    const button=workspaceButton(label,()=>navigateWorkspace(view));button.className='workspace-nav';button.dataset.workspaceNav=view;
    button.prepend(workspaceElement('span',icon,'nav-icon'));rail.append(button);
  }
  const hint=workspaceElement('p','Upload once in Elements. Use @ names in your shot.','rail-hint');rail.append(hint);document.body.append(rail);
  const page=workspaceElement('section',undefined,'workspace-page');page.id='workspacePage';
  const heading=workspaceElement('div',undefined,'workspace-page-heading');const title=workspaceElement('h1','Projects');title.id='workspacePageTitle';heading.append(title);page.append(heading);document.body.append(page);
  const elements=workspaceElement('div');elements.id='elementsWorkspace';const switcher=workspaceElement('div');switcher.id='elementsProjectSwitcher';elements.append(switcher,$('projectAssetsPanel'));page.append(elements);
  const generations=workspaceElement('div');generations.id='generationsWorkspace';
  const head=document.querySelector('.history-head');let node=head;while(node){const next=node.nextElementSibling;generations.append(node);node=next;}page.append(generations);
  const activity=workspaceElement('div');activity.id='activityWorkspace';const queue=workspaceElement('section',undefined,'output-card');queue.append(workspaceElement('h2','Render queue'));const queueMirror=workspaceElement('div');queueMirror.id='activityQueue';queue.append(queueMirror);activity.append(queue,$('mediaExportsPanel'));
  const mirrorQueue=()=>{queueMirror.replaceChildren(...[...$('queueInfo').childNodes].map(node=>node.cloneNode(true)));};new MutationObserver(mirrorQueue).observe($('queueInfo'),{childList:true,subtree:true,characterData:true});mirrorQueue();page.append(activity);
  const activityButton=rail.querySelector('[data-workspace-nav=activity]');const activityBadge=workspaceElement('span','','activity-badge');activityButton.append(activityBadge);const syncActivity=()=>{const jobs=state.sharedExportsOrigin===api('')?state.sharedExports||[]:[],operations=state.sharedExportsOrigin===api('')?state.sharedMediaOperations||[]:[];const count=jobs.filter(job=>['queued','preparing','encoding','verifying'].includes(job.status)).length+operations.filter(operation=>operation!=='media_export'||!jobs.some(job=>['queued','preparing','encoding','verifying'].includes(job.status))).length;activityBadge.textContent=count?String(count):'';activityBadge.hidden=!count;};new MutationObserver(syncActivity).observe($('mediaExportsList'),{childList:true});syncActivity();
  const shortcut=workspaceButton('Open project elements →',()=>navigateWorkspace('elements'));shortcut.id='openProjectElements';shortcut.classList.add('elements-shortcut');$('projectPanel').after(shortcut);
  const library=workspaceButton('Browse all generations →',()=>navigateWorkspace('generations'));document.querySelector('.right').append(library);
  const exports=workspaceButton('Exports & preparation activity →',()=>navigateWorkspace('activity'));document.querySelector('.right').append(exports);
  $('assetPreviewClose').onclick=()=>$('assetPreviewDialog').close();
  $('assetPreviewDialog').addEventListener('close',()=>{$('assetPreviewContent').querySelectorAll('video,audio').forEach(media=>media.pause());$('assetPreviewContent').replaceChildren();});
  window.addEventListener('popstate',()=>setWorkspaceView(location.hash.slice(1),{history:false}));
  setWorkspaceView('projects',{history:false});
}

initWorkspaceNavigation();
initProjectWorkspace();
H3OrganizationUI.init();
