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
    previewUrl:asset.kind==='audio'?null:projectCtrl.apiUrl(`/h3_studio/lab/assets/${encodeURIComponent(asset.asset_id)}/file`),catalog:true,
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
async function openProjectWorkspace(id){
  if(workspaceLocked())throw Error('Wait for the current operation before changing projects.');
  await withProjectLoading(async()=>{
    if(projectCtrl.currentProject&&projectCtrl.currentProject.project_id!==id)await saveWorkspaceDraft();
    const project=await projectCtrl.loadProject(id);state.currentClipId=null;
    await hydrateProjectDraft(project.draft||{mode:'text',refs:[],guides:[],prompts:{text:'',frames:'',refs:''}});
    state.current=null;state.visibleResults=16;$('videoActionsDialog').close();$('upscaleStatus').textContent='';showStageMessage('Project workspace',project.name);renderResults();
  });
  document.body.classList.remove('project-hub-open');renderProjectCatalog();refreshLabControls();
}
async function showProjectHub(save=true){
  if(workspaceLocked())throw Error('Wait for the current operation before leaving this project.');
  if(save&&projectCtrl?.currentProject)await withProjectLoading(saveWorkspaceDraft);
  document.body.classList.add('project-hub-open');await renderProjectHub();
}
async function renderProjectHub(){
  const controller=projectCtrl,list=$('projectHubList');if(!controller||!list)return;
  const response=await controller.listProjects();if(controller!==projectCtrl)return;
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
  const existing=state.refs.find(ref=>ref.assetId===item.assetId);
  if(existing){selectMode('refs');if(state.mode!=='refs')throw Error('References mode is unavailable.');return existing;}
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
    if(state.mode!==initialMode||$('prompt').value!==initialPrompt)throw Error('The prompt changed while loading this asset. Your edits are preserved; select the asset again.');
    // Readiness gates apply before committing a reference, including selected checkpoint compatibility.
    selectMode('refs');if(state.mode!=='refs')throw Error('References mode is unavailable on this server.');
    url=URL.createObjectURL(blob);
    const ref={assetId:item.assetId,file:new File([blob],record.original_name||item.alias,{type:blob.type}),kind:item.kind,alias:item.alias,
      role:item.role||'custom',previewUrl:item.kind==='audio'?null:url,url,useAudio:false,trimEnabled:false,trimStart:0,trimDuration:15,fitVideo:true,instruction:item.notes||''};
    if(item.kind==='audio'){
      const audio=document.createElement('audio');audio.preload='metadata';audio.src=url;
      audio.onloadedmetadata=()=>{if(state.refs.includes(ref)){ref.localDuration=audio.duration;renderRefs();}};
    }
    state.refs.push(ref);url=null;renderRefs();renderEstimates();saveDraft();return ref;
  }finally{if(url)URL.revokeObjectURL(url);workspaceCatalogBusy=false;renderProjectCatalog();}
}
async function insertProjectMention(item,range=null){
  const input=$('prompt'),start=range?.start??input.selectionStart,end=range?.end??input.selectionEnd;
  const pid=state.activeProjectId,mode=state.mode;
  const ref=item.catalog?await activateProjectAsset(item):item;
  if(pid!==state.activeProjectId)throw Error('Project changed before inserting the reference.');
  // Switching Text/Frames to References keeps the user's current prompt.
  if(mode!=='refs'&&item.catalog){state.prompts.refs=state.prompts[mode]||'';input.value=state.prompts.refs;}
  input.setRangeText('@'+ref.alias+' ',Math.min(start,input.value.length),Math.min(end,input.value.length),'end');
  $('mentionMenu').classList.add('hidden');input.focus();renderPromptAssets();saveDraft();
}
function renderProjectCatalog(){
  const list=$('projectAssetList');if(!list)return;list.replaceChildren();
  const project=state.currentProject;
  $('workspaceName').textContent=project?.name||'Choose a project';
  $('assetUpload').disabled=!project||workspaceLocked();$('addAssetCategory').disabled=!project||workspaceLocked();
  if(!project)return;
  const selected=$('assetCategory').value;
  $('assetCategory').replaceChildren();
  for(const category of project.asset_categories||[]){const option=workspaceElement('option',category.name);option.value=category.id;$('assetCategory').append(option);}
  if([...$('assetCategory').options].some(option=>option.value===selected))$('assetCategory').value=selected;
  const search=$('assetSearch').value.toLocaleLowerCase();
  for(const category of project.asset_categories||[]){
    const group=workspaceElement('details',undefined,'asset-group');group.open=true;
    const items=projectCatalogItems().filter(item=>item.category===category.id&&[item.label,item.alias,item.notes||''].some(value=>value.toLocaleLowerCase().includes(search)));
    const summary=workspaceElement('summary',category.name+' · '+items.length);
    const rename=workspaceButton('Rename',()=>{const name=prompt('Category name',category.name);if(name?.trim())return workspaceMutation({action:'rename_category',category:category.id,name});});
    rename.setAttribute('aria-label','Rename '+category.name+' category');rename.disabled=workspaceLocked();rename.style.marginLeft='12px';
    rename.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});summary.append(rename);group.append(summary);
    if(!items.length)group.append(workspaceElement('p','No matching assets. Choose this category and upload files.','tip'));
    for(const item of items){
      const row=workspaceElement('div',undefined,'catalog-asset');
      if(item.kind==='image'){const image=workspaceElement('img');image.src=item.previewUrl;image.alt=item.label;image.loading='lazy';row.append(image);}
      else row.append(workspaceElement('span',item.kind==='audio'?'♫':'▶','asset-kind'));
      const description=workspaceElement('div',undefined,'catalog-description');description.append(workspaceElement('strong',item.label),workspaceElement('small','@'+item.alias+' · '+item.kind));row.append(description);
      const actions=workspaceElement('div',undefined,'catalog-actions');
      const use=workspaceButton('Use',()=>insertProjectMention(item));use.disabled=workspaceLocked();
      const edit=workspaceButton('Edit',()=>editProjectAsset(item));edit.disabled=workspaceLocked();actions.append(use,edit);row.append(actions);group.append(row);
    }
    list.append(group);
  }
}
function editProjectAsset(item){
  const dialog=$('assetEditDialog');dialog.dataset.assetId=item.assetId;
  $('assetEditStatus').textContent='';$('assetEditName').value=item.label;$('assetEditNotes').value=item.notes||'';
  $('assetEditAlias').textContent='Stable prompt alias: @'+item.alias;
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
    try{await withProjectLoading(async()=>{await saveWorkspaceDraft();const project=await projectCtrl.createProject(name,{width:state.width,height:state.height});state.currentClipId=null;state.current=null;await hydrateProjectDraft({mode:'text',refs:[],guides:[],prompts:{text:'',frames:'',refs:''}});updateProjectUI(project);});document.body.classList.remove('project-hub-open');$('videoActionsDialog').close();showStageMessage('Project workspace',name);$('newProjectName').value='';}
    catch(error){$('projectHubStatus').textContent=error.message;}
  };
  $('assetSearch').oninput=renderProjectCatalog;
  $('addAssetCategory').onclick=()=>{const name=prompt('New asset category');if(name?.trim())workspaceMutation({action:'add_category',name}).catch(error=>info(error.message,true));};
  $('assetUpload').onclick=()=>{if(!workspaceLocked())$('projectAssetFiles').click();};
  $('projectAssetFiles').onchange=async()=>{
    const controller=projectCtrl,pid=state.activeProjectId,category=$('assetCategory').value,files=[...$('projectAssetFiles').files];
    if(!pid||workspaceLocked())return;workspaceCatalogBusy=true;renderProjectCatalog();
    try{
      let done=0;for(const file of files){
        const body=new FormData();body.append('file',file);
        await controller.fetchJson(`/h3_studio/lab/assets?project_id=${encodeURIComponent(pid)}&category=${encodeURIComponent(category)}&name=${encodeURIComponent(file.name)}`,{method:'POST',body});
        $('assetUploadStatus').textContent=`Saved ${++done}/${files.length} assets`;
      }
    }catch(error){$('assetUploadStatus').textContent=error.message;}
    finally{workspaceCatalogBusy=false;$('projectAssetFiles').value='';if(controller===projectCtrl&&pid===state.activeProjectId)await controller.loadProject(pid);renderProjectCatalog();}
  };
  $('assetEditSave').onclick=async()=>{
    try{await workspaceMutation({action:'edit_asset',asset_id:$('assetEditDialog').dataset.assetId,name:$('assetEditName').value,category:$('assetEditCategory').value,notes:$('assetEditNotes').value});$('assetEditDialog').close();}
    catch(error){$('assetEditStatus').textContent=error.message;}
  };
  $('assetEditClose').onclick=()=>$('assetEditDialog').close();
  $('libraryScope').onchange=()=>{state.visibleResults=16;renderResults();};
  $('projectSelect').onchange=()=>{if($('projectSelect').value)openProjectWorkspace($('projectSelect').value).catch(error=>info(error.message,true));};
  renderProjectCatalog();renderProjectHub().catch(error=>{$('projectHubStatus').textContent=error.message;});
}
initProjectWorkspace();
