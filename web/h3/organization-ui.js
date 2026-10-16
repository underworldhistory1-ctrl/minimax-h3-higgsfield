/* Shared organization/reuse flows operate on durable project IDs, never browser-only copies. */
'use strict';
const H3OrganizationUI=(()=>{
 let organization={revision:1,folders:[]},selected=new Set(),selectedProject=null,transferContext=null,reuseContext=null,hubEpoch=0,reuseEpoch=0,projectCache=[];
 async function refreshFolders(){const controller=projectCtrl;const value=await controller.fetchJson('/h3_studio/lab/organization');if(controller===projectCtrl)organization=value.folders?value:{revision:1,folders:[]};return organization;}
 function populate(select,values,first){const before=select.value;select.replaceChildren();for(const [value,label] of [first,...values]){const option=workspaceElement('option',label);option.value=value;select.append(option);}if([...select.options].some(o=>o.value===before))select.value=before;}
 async function askName(title,value=''){
  const dialog=$('workspaceNameDialog');if(dialog.open)throw Error('Finish the current naming action first.');$('workspaceNameTitle').textContent=title;$('workspaceNameInput').value=value;$('workspaceNameError').textContent='';
  return new Promise(resolve=>{const finish=()=>{dialog.removeEventListener('close',finish);resolve(dialog.returnValue==='save'?$('workspaceNameInput').value.trim():null);};dialog.addEventListener('close',finish);dialog.returnValue='cancel';dialog.showModal();$('workspaceNameInput').focus();$('workspaceNameInput').select();});
 }
 async function createFolder(){if(workspaceLocked())return;const name=await askName('New project folder');if(!name)return;await refreshFolders();await projectCtrl.fetchJson('/h3_studio/lab/organization',{method:'POST',body:JSON.stringify({operation:{action:'create_folder',name},expected_revision:organization.revision})});await renderProjectHub();}
 async function renameFolder(){const id=$('projectFolderFilter').value,folder=organization.folders.find(f=>f.id===id);if(!folder)return;const name=await askName('Rename project folder',folder.name);if(!name)return;await projectCtrl.fetchJson('/h3_studio/lab/organization',{method:'POST',body:JSON.stringify({operation:{action:'rename_folder',folder_id:id,name},expected_revision:organization.revision})});await renderProjectHub();}
 async function fileProject(project){if(workspaceLocked())throw Error('Finish the current operation first.');await refreshFolders();populate($('fileProjectFolder'),organization.folders.map(f=>[f.id,f.name]),['','Unfiled']);$('fileProjectFolder').value=project.folder_id||'';$('fileProjectDialog').dataset.projectId=project.project_id;$('fileProjectDialog').dataset.revision=project.revision;$('fileProjectTitle').textContent='Move '+project.name+' to folder';$('fileProjectStatus').textContent='';$('fileProjectDialog').showModal();}
 function projectView(value){
  const view=value==='list'?'list':'grid';$('projectHubList').dataset.view=view;
  for(const button of document.querySelectorAll('[data-project-view]'))button.setAttribute('aria-pressed',String(button.dataset.projectView===view));
  try{localStorage.setItem('h3studio.projects.view',view);}catch(_){}return view;
 }
 function libraryControls(list){
  if($('projectLibraryControls'))return;
  const bar=workspaceElement('div',undefined,'project-library-controls');bar.id='projectLibraryControls';
  const label=workspaceElement('div',undefined,'project-library-summary'),description=workspaceElement('span');H3Guidance.setText(description,'projectLibrarySummary');label.append(workspaceElement('strong','Your projects'),description);
  const views=workspaceElement('div',undefined,'project-view-switch');views.setAttribute('role','group');views.setAttribute('aria-label','Project display');
  for(const [value,name] of [['grid','Grid'],['list','List']]){const button=workspaceButton(name,()=>projectView(value));button.dataset.projectView=value;button.setAttribute('aria-label',name+' view');views.append(button);}
  bar.append(label,views);list.before(bar);let saved='grid';try{saved=localStorage.getItem('h3studio.projects.view')||'grid';}catch(_){}projectView(saved);
  $('projectSearch').setAttribute('placeholder','Search project names…');$('projectSearch').setAttribute('type','search');
 }
 async function renderProjects(projects,list,refresh=true){
  libraryControls(list);const epoch=++hubEpoch,controller=projectCtrl;list.setAttribute('aria-busy','true');
  try{
   if(refresh)await refreshFolders();if(epoch!==hubEpoch||controller!==projectCtrl)return;projectCache=projects;
   populate($('projectFolderFilter'),[['unfiled','Unfiled'],...organization.folders.map(f=>[f.id,f.name])],['all','All project folders']);
   const query=$('projectSearch').value.trim().toLocaleLowerCase(),folder=$('projectFolderFilter').value,sort=$('projectSort').value;
   $('renameProjectFolder').disabled=!organization.folders.some(f=>f.id===folder)||workspaceLocked();
   const filtered=projects.filter(p=>p.name.toLocaleLowerCase().includes(query)&&(folder==='all'||(folder==='unfiled'?!p.folder_id:p.folder_id===folder)));
   filtered.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):(a,b)=>(b.updated_at||0)-(a.updated_at||0));list.replaceChildren();
   for(const project of filtered){
    const card=workspaceElement('article',undefined,'project-card');card.dataset.projectId=project.project_id;
    const title=workspaceElement('h2',project.name);title.id='project-title-'+project.project_id;card.setAttribute('aria-labelledby',title.id);
    const media=workspaceElement('div',undefined,'project-card-preview');
    const fallback=workspaceElement('div',undefined,'project-preview-empty');fallback.append(workspaceElement('span','H3','project-preview-monogram'),workspaceElement('span','No image preview yet'));media.append(fallback);
    if(project.preview_asset_id){const image=document.createElement('img');image.alt='';image.loading='lazy';image.src=api('/h3_studio/lab/assets/'+encodeURIComponent(project.preview_asset_id)+'/thumbnail');image.onload=()=>fallback.hidden=true;image.onerror=()=>image.remove();media.append(image);}
    const body=workspaceElement('div',undefined,'project-card-body');
    body.append(workspaceElement('small',organization.folders.find(f=>f.id===project.folder_id)?.name||'Unfiled','project-folder-label'),title);
    const meta=workspaceElement('div',undefined,'project-card-meta');meta.append(workspaceElement('span',(project.asset_count||0)+' assets'),workspaceElement('span',(project.take_count||0)+' takes'));
    const date=Number(project.updated_at);if(Number.isFinite(date)&&date>0){const time=document.createElement('time');const updated=new Date(date<1e12?date*1000:date);time.dateTime=updated.toISOString();time.textContent=updated.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});time.title='Last updated '+updated.toLocaleString();meta.append(time);}body.append(meta);
    const actions=workspaceElement('div',undefined,'project-card-actions');
    const open=workspaceButton('Open',()=>openProjectWorkspace(project.project_id));open.classList.add('project-open');
    actions.append(open,workspaceButton('Rename',async()=>{const name=await askName('Rename project',project.name);if(name?.trim())await workspaceMutation({action:'rename_project',name},project);}),workspaceButton('Move to folder',()=>fileProject(project)),workspaceButton('Duplicate',async()=>{const name=await askName('Duplicate project',project.name+' (Copy)');if(!name)return;await projectCtrl.fetchJson('/h3_studio/lab/projects/'+encodeURIComponent(project.project_id)+'/duplicate',{method:'POST',body:JSON.stringify({name})});await renderProjectHub();}));
    for(const button of actions.children)button.disabled=workspaceLocked();card.append(media,body,actions);list.append(card);
   }
   if(!filtered.length){const empty=workspaceElement('div',undefined,'project-library-empty');empty.append(workspaceElement('span',query||folder!=='all'?'No matching projects':'Your next film starts here','empty-title'),workspaceElement('p',query||folder!=='all'?'Try another project name or folder.':'Name a project above to keep its references, shot settings and takes together.'));const action=workspaceButton(query||folder!=='all'?'Clear filters':'Name your first project',()=>{if(query||folder!=='all'){$('projectSearch').value='';$('projectFolderFilter').value='all';renderProjects(projectCache,list,false).catch(error=>info(error.message,true));}else $('newProjectName').focus();});empty.append(action);H3Guidance.setText(empty.querySelector('p'),query||folder!=='all'?'projectLibraryNoMatch':'projectLibraryEmpty');list.append(empty);}
   $('projectHubStatus').textContent=filtered.length+' of '+projects.length+' projects';$('projectHubStatus').dataset.state='ready';
  }catch(error){if(epoch===hubEpoch){$('projectHubStatus').textContent='Could not load the project library. '+error.message;$('projectHubStatus').dataset.state='error';}throw error;}
  finally{if(epoch===hubEpoch)list.setAttribute('aria-busy','false');}
 }
 function assetSelection(item,row){if(selectedProject!==state.activeProjectId){selected.clear();selectedProject=state.activeProjectId;}const label=workspaceElement('label',undefined,'catalog-select');const box=document.createElement('input');box.type='checkbox';box.checked=selected.has(item.assetId);box.setAttribute('aria-label','Select '+item.label);box.disabled=workspaceLocked();box.onchange=()=>{box.checked?selected.add(item.assetId):selected.delete(item.assetId);updateSelection();};label.append(box);row.prepend(label);}
 function updateSelection(){for(const id of ['transferAssets','fileSelectedAssets','clearSelectedAssets'])if($(id))$(id).disabled=!selected.size||workspaceLocked();if($('assetSelectionCount'))$('assetSelectionCount').textContent=selected.size+' selected';}
 function assetTools(){
  if(selectedProject!==state.activeProjectId){selected.clear();selectedProject=state.activeProjectId;}const project=state.currentProject;
  if(project){const ids=new Set(project.assets.map(a=>a.asset_id));selected=new Set([...selected].filter(id=>ids.has(id)));populate($('assetFolderFilter'),[['unfiled','Unfiled'],...(project.asset_folders||[]).map(f=>[f.id,f.name])],['all','All asset folders']);populate($('fileAssetsFolder'),(project.asset_folders||[]).map(f=>[f.id,f.name]),['','Unfiled']);}
  updateSelection();$('newAssetFolder').disabled=!project||workspaceLocked();$('renameAssetFolder').disabled=!(project?.asset_folders||[]).some(f=>f.id===$('assetFolderFilter').value)||workspaceLocked();
 }
 async function openTransfer(assetIds=[],takeIds=[]){
  if(workspaceLocked()||!state.currentProject)throw Error('Open a project and finish the current operation first.');
  const controller=projectCtrl,sourceId=state.activeProjectId;
  await withProjectLoading(saveWorkspaceDraft);if(controller!==projectCtrl||sourceId!==state.activeProjectId)return;const source=state.currentProject;
  const response=await controller.listProjects();if(controller!==projectCtrl||sourceId!==state.activeProjectId)return;
  const targets=response.projects.filter(p=>p.project_id!==source.project_id);
  if(!targets.length)throw Error('Create another project before transferring materials.');
  transferContext={source,assetIds:[...assetIds],takeIds:[...takeIds],requestId:crypto.randomUUID(),controller:projectCtrl};
  populate($('transferTarget'),targets.map(p=>[p.project_id,p.name]),['','Choose destination']);$('transferMode').value='copy';$('transferStatus').textContent='Copy preserves source shots. Move is checked for dependencies and accepted sequence takes.';$('transferSummary').textContent=`${assetIds.length} assets · ${takeIds.length} takes. Required references and take ancestry travel with the takes.`;$('transferDialog').showModal();
 }
 async function applyTransfer(){const ctx=transferContext;if(!ctx||ctx.controller!==projectCtrl||workspaceLocked())return;const id=$('transferTarget').value,mode=$('transferMode').value;if(!id){$('transferStatus').textContent='Choose a destination project.';return;}const button=$('transferApply');button.disabled=true;workspaceCatalogBusy=true;
  try{await withProjectLoading(async()=>{const target=await ctx.controller.fetchJson('/h3_studio/lab/projects/'+encodeURIComponent(id));if(ctx.controller!==projectCtrl||state.activeProjectId!==ctx.source.project_id)throw Error('Source workspace changed; reopen the transfer.');const result=await ctx.controller.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(ctx.source.project_id)}/transfer`,{method:'POST',body:JSON.stringify({request_id:ctx.requestId,target_project_id:id,source_revision:ctx.source.revision,target_revision:target.revision,asset_ids:ctx.assetIds,take_ids:ctx.takeIds,mode})});if(ctx.controller!==projectCtrl||state.activeProjectId!==ctx.source.project_id)return;ctx.controller.currentProject=result.source;updateProjectUI(result.source);selected.clear();$('transferDialog').close();info(`Transferred ${result.receipt.assets_added} assets and ${result.receipt.takes} takes. Original reference identities are preserved.`);await renderProjectHub();});}
  catch(error){$('transferStatus').textContent=error.message;}
  finally{workspaceCatalogBusy=false;button.disabled=false;renderProjectCatalog();}
 }
 async function openReuse(entry){
  if(workspaceLocked())throw Error('Finish the current operation before reusing a video.');if(!entry)return;
  const controller=projectCtrl,origin=api(''),output=resultOutputPath(entry),epoch=++reuseEpoch;reuseContext=null;$('videoActionsDialog').close();
  $('reuseStatus').textContent='Checking saved prompt, settings and references…';$('reuseApply').disabled=true;$('reuseDialog').showModal();
  try{const prepared=await controller.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:output})});const response=await controller.listProjects();if(epoch!==reuseEpoch||!$('reuseDialog').open||controller!==projectCtrl||origin!==api(''))return;
   reuseContext={prepared,controller,origin,output};populate($('reuseTarget'),response.projects.map(p=>[p.project_id,p.name]),['new','New project']);$('reuseTarget').value=state.activeProjectId||prepared.source_project_id||'new';$('reuseProjectName').value='Reused shot';$('reuseNewName').hidden=$('reuseTarget').value!=='new';
   $('reuseStatus').textContent=prepared.available?(prepared.complete?'Full saved setup available. No render starts automatically.':prepared.warnings.join('\n')):prepared.warnings.join('\n');$('reuseApply').disabled=!prepared.available;
   $('reuseSummary').textContent=prepared.available?`${prepared.draft.mode} · ${prepared.draft.settings?.duration||'?'} frames · seed ${prepared.draft.settings?.seed??'?'} · ${prepared.assets.length} stored inputs`:entry.file.filename;
   // Restore directly; retain the dialog for actionable recovery errors.
   if(prepared.available)await applyReuse();
  }catch(error){$('reuseStatus').textContent=error.message;}
 }
 async function applyReuse(){const ctx=reuseContext;if(!ctx?.prepared.available||ctx.controller!==projectCtrl||ctx.origin!==api('')||workspaceLocked())return;const button=$('reuseApply');button.disabled=true;
  try{await withProjectLoading(async()=>{await saveWorkspaceDraft();const id=$('reuseTarget').value;let target;
    if(id==='new'){const name=$('reuseProjectName').value.trim();if(!name)throw Error('Name the destination project.');target=await projectCtrl.createProject(name);}
    else target=await projectCtrl.fetchJson('/h3_studio/lab/projects/'+encodeURIComponent(id));
    const result=await projectCtrl.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:ctx.output,target_project_id:target.project_id,expected_revision:target.revision})});
    await projectCtrl.loadProject(result.project.project_id);state.currentClipId=null;state.current=null;await hydrateProjectDraft(result.project.draft);
    const missingAdapters=(result.project.draft.loras||[]).filter(l=>l.enabled&&!state.loras.some(current=>current.name===l.name&&current.enabled)).map(l=>'LoRA '+l.name);
    const checkpoint=result.project.draft.configuration?.checkpoint,missingCheckpoint=checkpoint&&checkpoint!==selectedCheckpoint()?['Checkpoint '+checkpoint]:[];
    state.restoreMissing=[...new Set([...(state.restoreMissing||[]),...result.missing,...missingAdapters,...missingCheckpoint])];if(state.restoreMissing.length)info('Reused setup needs inputs: '+state.restoreMissing.join(', '),true);else info('Saved prompt, references and settings restored. Review and Generate when ready.');
   });$('reuseDialog').close();setWorkspaceView('studio');showStageMessage('Reused shot','Review the restored setup before generating.');saveDraft();}
  catch(error){$('reuseStatus').textContent=error.message;}
  finally{button.disabled=!ctx.prepared.available;}
 }
 function init(){
  for(const id of ['projectSearch','projectFolderFilter','projectSort'])$(id).addEventListener(id==='projectSearch'?'input':'change',()=>renderProjects(projectCache,$('projectHubList'),false).catch(error=>info(error.message,true)));
  $('newProjectFolder').onclick=()=>createFolder().catch(error=>info(error.message,true));$('renameProjectFolder').onclick=()=>renameFolder().catch(error=>info(error.message,true));
  const rename=workspaceButton('Rename project',async()=>{if(!state.currentProject||workspaceLocked())return;const name=await askName('Rename project',state.currentProject.name);if(name)await workspaceMutation({action:'rename_project',name});});rename.id='renameCurrentProject';$('projectNameDisplay').after(rename);
  const edited=workspaceButton('Confirm edited setup',async()=>{if(workspaceLocked()||!state.reuseUnresolved?.length)return;if(!confirm('The original setup has missing requirements: '+state.reuseUnresolved.join(', ')+'. Use the currently loaded inputs as a NEW edited setup instead?'))return;state.reuseUnresolved=[];state.reuseRequiredLoras=[];state.restoreMissing=[];state.reuseSource=null;state.reuseCheckpoint=null;await withProjectLoading(saveWorkspaceDraft);edited.hidden=true;info('Edited setup saved. It is no longer an exact restoration of the original take.');});edited.id='confirmEditedSetup';edited.hidden=true;rename.after(edited);
  $('workspaceNameForm').onsubmit=event=>{if(event.submitter?.value==='save'&&!$('workspaceNameInput').value.trim()){event.preventDefault();$('workspaceNameError').textContent='Enter a name.';}};
  $('fileProjectApply').onclick=async()=>{const dialog=$('fileProjectDialog');try{await workspaceMutation({action:'file_project',folder_id:$('fileProjectFolder').value||null},{project_id:dialog.dataset.projectId,revision:Number(dialog.dataset.revision)});dialog.close();}catch(error){$('fileProjectStatus').textContent=error.message;}};
  $('newAssetFolder').onclick=async()=>{const name=await askName('New asset folder');if(name)await workspaceMutation({action:'add_asset_folder',name});};
  $('renameAssetFolder').onclick=async()=>{const folder=state.currentProject?.asset_folders?.find(f=>f.id===$('assetFolderFilter').value);if(!folder||workspaceLocked())return;const name=await askName('Rename asset folder',folder.name);if(name)await workspaceMutation({action:'rename_asset_folder',folder_id:folder.id,name});};
  $('selectVisibleAssets').onclick=()=>{if(workspaceLocked())return;for(const box of document.querySelectorAll('.catalog-select input')){if(!box.checked){box.checked=true;box.onchange();}}};
  $('assetFolderFilter').onchange=renderProjectCatalog;$('assetSort').onchange=renderProjectCatalog;
  $('clearSelectedAssets').onclick=()=>{selected.clear();renderProjectCatalog();};$('transferAssets').onclick=()=>openTransfer([...selected]).catch(error=>info(error.message,true));
  $('fileSelectedAssets').onclick=()=>{$('fileAssetsStatus').textContent='';$('fileAssetsDialog').showModal();};$('fileAssetsApply').onclick=async()=>{try{await workspaceMutation({action:'file_assets',asset_ids:[...selected],folder_id:$('fileAssetsFolder').value||null});selected.clear();$('fileAssetsDialog').close();renderProjectCatalog();}catch(error){$('fileAssetsStatus').textContent=error.message;}};
  $('transferApply').onclick=applyTransfer;$('reuseTarget').onchange=()=>{$('reuseNewName').hidden=$('reuseTarget').value!=='new';};$('reuseApply').onclick=applyReuse;
  $('reuseDialog').addEventListener('close',()=>{++reuseEpoch;reuseContext=null;});
  $('videoActionsReuse').onclick=()=>openReuse(videoActionsEntry).catch(error=>info(error.message,true));
  $('videoActionsTransfer').onclick=()=>{const entry=videoActionsEntry;$('videoActionsDialog').close();const take=state.currentProject?.takes?.find(t=>t.take_id===entry?.takeId);if(!take){info('Open the owning project to transfer this take. Older unassigned videos can be reused when saved inputs exist.',true);return;}openTransfer([],[take.take_id]).catch(error=>info(error.message,true));};
  $('restoreTake').onclick=()=>openReuse(state.current).catch(error=>info(error.message,true));
  for(const dialog of document.querySelectorAll('.organization-dialog'))dialog.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>dialog.close('cancel'));
  assetTools();
 }
 async function fileNewProject(project){const folder=$('projectFolderFilter').value;if(!organization.folders.some(f=>f.id===folder))return project;const updated=await projectCtrl.fetchJson(`/h3_studio/lab/projects/${encodeURIComponent(project.project_id)}/workspace`,{method:'POST',body:JSON.stringify({operation:{action:'file_project',folder_id:folder},expected_revision:project.revision})});projectCtrl.currentProject=updated;return updated;}
 return {init,renderProjects,assetSelection,assetTools,openReuse,openTransfer,askName,fileNewProject};
})();
