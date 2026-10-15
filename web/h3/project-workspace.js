"use strict";
// Project catalog and navigation share the existing controller and native reference compiler.
function workspaceElement(tag,text,className){
  const element=document.createElement(tag);if(text!==undefined)element.textContent=text;
  if(className)element.className=className;return element;
}
function workspaceButton(text,action){const button=workspaceElement('button',text,'button alt smallbtn');button.type='button';button.onclick=()=>Promise.resolve().then(action).catch(error=>info(error.message,true));return button;}
let workspaceCatalogBusy=false;
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
    await renderProjectHub();return updated;
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
  const draft=await persistProjectDraft();await projectCtrl.saveCurrentProject({draft,assets:mergeProjectAssetDescriptors(projectCtrl.currentProject.assets||[],allInputItems())});
}
async function openProjectWorkspace(id,{view='studio'}={}){
  if(workspaceLocked())throw Error('Wait for the current operation before changing projects.');
  await withProjectLoading(async()=>{
    if(projectCtrl.currentProject)await saveWorkspaceDraft();
    const project=await projectCtrl.loadProject(id);state.currentClipId=null;
    await hydrateWorkspaceDraft(project);
    state.current=null;state.visibleResults=16;$('videoActionsDialog').close();$('upscaleStatus').textContent='';showStageMessage('Project workspace',project.name);renderResults();
  });
  document.body.classList.remove('project-hub-open');setWorkspaceView(view);renderProjectCatalog();refreshLabControls();
}
async function showProjectHub(save=true){
  if(workspaceLocked())throw Error('Wait for the current operation before leaving this project.');
  if(save&&projectCtrl?.currentProject)await withProjectLoading(saveWorkspaceDraft);
  document.body.classList.add('project-hub-open');setWorkspaceView('projects');await renderProjectHub();
}
async function renderProjectHub(){
  const controller=projectCtrl,list=$('projectHubList');if(!controller||!list)return;
  const response=await controller.listProjects();if(controller!==projectCtrl)return;
  if(typeof H3OrganizationUI!=='undefined'){await H3OrganizationUI.renderProjects(response.projects||[],list);return;}
  list.replaceChildren();
  for(const project of response.projects||[]){
    const card=workspaceElement('article',undefined,'project-card');card.dataset.projectId=project.project_id;
    card.append(workspaceElement('h2',project.name),workspaceElement('p',`${project.asset_count||0} assets · ${project.take_count||0} takes`,'tip'));
    const actions=workspaceElement('div',undefined,'row');
    actions.append(workspaceButton('Open',()=>openProjectWorkspace(project.project_id)),workspaceButton('Rename',async()=>{
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
    const record=await controller.getAsset(item.assetId);
    const blob=await controller.mediaBlob(item.assetId);
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
    for(const item of projectCatalogItems()){
      if(pid!==state.activeProjectId)return;
      const text=H3PromptCompiler.normalizeReferenceMentions($('prompt').value||'',projectCatalogItems());
      const mentions=new Set([...text.matchAll(/@([\p{L}\p{N}_-]+)/gu)].map(match=>match[1]));
      if(!mentions.has(item.alias)||state.refs.some(ref=>ref.assetId===item.assetId))continue;
      await activateProjectAsset(item);
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
  for(const button of $('projectHubList')?.querySelectorAll('button')||[])button.disabled=locked;
}
function renderProjectCatalog(){
  refreshProjectHubControls();
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
  $('assetLibraryCount').textContent=items.length+' shown · '+project.assets.length+' in project';
  for(const item of items){
    const row=workspaceElement('article',undefined,'catalog-asset');
    if(typeof H3OrganizationUI!=='undefined')H3OrganizationUI.assetSelection(item,row);
    if(item.kind==='image'){const image=workspaceElement('img');image.src=item.previewUrl;image.alt=item.label;image.loading='lazy';image.decoding='async';image.onerror=()=>image.replaceWith(workspaceElement('span','Image','asset-kind'));row.append(image);}
    else row.append(workspaceElement('span',item.kind==='audio'?'♫':'▶','asset-kind'));
    const description=workspaceElement('div',undefined,'catalog-description');description.append(workspaceElement('strong',item.label),workspaceElement('small','@'+item.alias+' · '+item.tag+' · '+item.kind));row.append(description);
    const actions=workspaceElement('div',undefined,'catalog-actions');
    const use=workspaceButton('Use',()=>insertProjectMention(item).then(()=>setWorkspaceView('studio')));use.disabled=workspaceLocked();
    const preview=workspaceButton('Preview',()=>previewProjectAsset(item));preview.disabled=workspaceLocked();
    const edit=workspaceButton('Edit',()=>editProjectAsset(item));edit.disabled=workspaceLocked();actions.append(preview,use,edit);row.append(actions);list.append(row);
  }
  if(!items.length){const empty=workspaceElement('div','No assets here yet. Choose an upload category and add your files, or change the filters.','asset-library-empty');list.append(empty);}

}
function editProjectAsset(item){
  const dialog=$('assetEditDialog');dialog.dataset.assetId=item.assetId;
  $('assetEditStatus').textContent='';$('assetEditName').value=item.label;$('assetEditNotes').value=item.notes||'';
  const updateAliasPreview=()=>{
    const custom=$('assetEditName').value.trim();
    const alias=H3PromptCompiler.mentionName({name:custom,alias:item.alias});
    $('assetEditAlias').textContent='Mention identifier: @'+alias;
  };
  $('assetEditName').oninput=updateAliasPreview;
  updateAliasPreview();
  $('assetEditCategory').replaceChildren();for(const category of state.currentProject.asset_categories){const option=workspaceElement('option',category.name);option.value=category.id;$('assetEditCategory').append(option);}
  $('assetEditCategory').value=item.category;dialog.showModal();
}
function initProjectWorkspace(){
  $('btnNewProject').onclick=()=>showProjectHub().then(()=>$('newProjectName').focus()).catch(error=>info(error.message,true));
  $('projectsHome').onclick=()=>showProjectHub().catch(error=>info(error.message,true));
  $('projectHubRefresh').onclick=()=>renderProjectHub().catch(error=>{$('projectHubStatus').textContent=error.message;});
  $('projectHubCreate').onclick=async()=>{
    if(workspaceLocked()||!projectCtrl)return;
    const name=$('newProjectName').value.trim();if(!name){$('newProjectName').focus();return;}
    try{await withProjectLoading(async()=>{await saveWorkspaceDraft();const project=await H3OrganizationUI.fileNewProject(await projectCtrl.createProject(name,{width:state.width,height:state.height}));state.currentClipId=null;state.current=null;await hydrateProjectDraft({mode:'text',refs:[],guides:[],prompts:{text:'',frames:'',refs:''}});updateProjectUI(project);});document.body.classList.remove('project-hub-open');setWorkspaceView('studio');$('videoActionsDialog').close();showStageMessage('Project workspace',name);$('newProjectName').value='';}
    catch(error){$('projectHubStatus').textContent=error.message;}
  };
  $('assetSearch').oninput=renderProjectCatalog;
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
    finally{workspaceCatalogBusy=false;$('projectAssetFiles').value='';if(controller===projectCtrl&&pid===state.activeProjectId)await controller.loadProject(pid);renderProjectCatalog();}
  };
  $('projectAssetFiles').onchange=()=>uploadCatalogFiles([...$('projectAssetFiles').files]);
  const drop=$('assetDropzone');drop.ondragover=event=>{event.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=event=>{event.preventDefault();drop.classList.remove('dragging');uploadCatalogFiles([...event.dataTransfer.files]).catch(error=>info(error.message,true));};drop.onclick=()=>$('assetUpload').click();
  $('assetEditSave').onclick=async()=>{
    try{await workspaceMutation({action:'edit_asset',asset_id:$('assetEditDialog').dataset.assetId,name:$('assetEditName').value,category:$('assetEditCategory').value,notes:$('assetEditNotes').value});$('assetEditDialog').close();}
    catch(error){$('assetEditStatus').textContent=error.message;}
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
