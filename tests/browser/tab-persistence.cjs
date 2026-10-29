/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={audio_refine_ready:true,server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser;const submissions=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1920,height:1080}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;if(url.pathname==='/h3_studio/lab/jobs'&&route.request().method()==='POST'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Captured setup; no GPU submission.'}});}
 if(url.pathname.startsWith('/h3_studio/lab/organization')||url.pathname.startsWith('/h3_studio/lab/videos/reuse')||url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
 if(url.pathname.startsWith('/object_info/')){const name=url.pathname.split('/').pop();data={[name]:schemas[name]||{input:{required:{}}}};}
 else if(url.pathname==='/h3_studio/qwen/readiness')data={ready:true,profiles:{int8:{ready:true},bf16:{ready:true}},nodes:{}};
 else if(url.pathname==='/system_stats')data={devices:[{name:'UI fixture · no inference'}]};
 else if(url.pathname==='/h3_studio/readiness')data={models:{fl2va:true,ref2va:true,text_encoder:true,video_vae:true,audio_vae:true},nodes:Object.fromEntries(['UNETLoader','MiniMaxH3SigmaShift','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','ConditioningZeroOut','KSampler','VAEDecode','VAEDecodeAudio','CreateVideo','H3SaveVideo','H3ReleaseForDecode','H3LoadSavedLatent','SaveVideo','LoadImage','LoadVideo','GetVideoComponents','LoadAudio','LoraLoaderModelOnly','SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache','ImageCrop','ImageScale','ImageFromBatch','TrimAudioDuration'].map(x=>[x,true])),quality:{h3_vae_tile_fix:true}};
 else if(url.pathname==='/h3_studio/lab/capabilities')data=caps;
 else if(url.pathname==='/h3_studio/lab/prompt/status')data={configured:false,reason:'Browser fixture: prompt AI not connected.'};
 else if(url.pathname==='/h3_studio/loras')data={items:['h3_character_swap_pro4500_1000.safetensors']};
 else if(url.pathname==='/queue')data={queue_running:[],queue_pending:[]};
 else if(url.pathname==='/history')data={};
 else if(url.pathname.startsWith('/h3_studio/'))data=url.pathname.includes('library')?{videos:[]}:url.pathname.includes('projects')?{projects:[]}:{samples:[],contexts:[]};
 if(data!==undefined)return route.fulfill({json:data});return route.continue();
 });



 const url='http://127.0.0.1:18925/web/index.html';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64');
 await page.goto(url);await page.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.nodesReady);
 await page.locator('#sceneName').fill('Tab persistence');await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>!state.projectLoading&&state.currentProject);
 const pid=await page.evaluate(()=>state.activeProjectId);
 await page.locator('.mode[data-mode=refs]').click();await page.evaluate(()=>state.pendingRefKind='image');await page.locator('#refFile').setInputFiles([{name:'Hero.png',mimeType:'image/png',buffer:png},{name:'Room.png',mimeType:'image/png',buffer:png}]);await page.waitForFunction(()=>state.refs.length===2);
 await page.locator('#prompt').fill('Tab A @Hero in @Room');
 await page.evaluate(async()=>{state.refs[0].role='character identity';state.refs[1].role='location';state.refs[0].instruction='Keep identity';state.refs[1].imageFit='contain';state.sampling={shift_audio:4};await H3VideoTabState.flush();});
 await page.waitForFunction(()=>document.getElementById('tabDraftStatus').textContent.includes('is saved'));
 await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.refs.length===2);assert.equal(await page.locator('#prompt').inputValue(),'Tab A @Hero in @Room');assert.equal(await page.evaluate(()=>state.refs[0].file.name),'Hero.png');assert.equal(await page.evaluate(()=>state.refs[0].role),'character identity');assert.equal(await page.evaluate(()=>state.sampling.shift_audio),4);
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(url);await second.waitForFunction(()=>projectCtrl&&!state.projectLoading);assert.equal(await second.evaluate(()=>state.currentProject),null);
 await second.evaluate(async id=>{await withProjectLoading(async()=>{const p=await projectCtrl.loadProject(id);await hydrateProjectDraft(p.draft||{mode:'text',prompts:{text:'',frames:'',refs:''},refs:[],guides:[]});});setWorkspaceView('studio');},pid);
 await second.locator('#prompt').fill('Independent tab B');await second.evaluate(async()=>{state.sampling={shift_audio:2};await H3VideoTabState.flush();});await second.waitForFunction(()=>document.getElementById('tabDraftStatus').textContent.includes('is saved'));
 await Promise.all([page.reload(),second.reload()]);await page.waitForFunction(()=>!state.projectLoading&&state.refs.length===2);await second.waitForFunction(()=>!state.projectLoading&&state.currentProject);
 assert.equal(await page.locator('#prompt').inputValue(),'Tab A @Hero in @Room');assert.equal(await second.locator('#prompt').inputValue(),'Independent tab B');assert.equal(await second.evaluate(()=>state.refs.length),0);assert.equal(await second.evaluate(()=>state.sampling.shift_audio),2);
 await page.locator('#prompt').fill('Immediate logo refresh @Hero in @Room');
 await Promise.all([page.waitForEvent('load'),page.locator('#brandRefresh').click()]);await page.waitForFunction(()=>!state.projectLoading&&state.refs.length===2);
 assert.equal(await page.locator('#prompt').inputValue(),'Immediate logo refresh @Hero in @Room');
 await page.evaluate(()=>{window.realDraftSave=H3TabDraftStore.save;H3TabDraftStore.save=async()=>{throw Error('Injected refresh save failure');};window.reloadGuardToken='still here';});
 await page.locator('#brandRefresh').click();await page.waitForFunction(()=>!document.getElementById('brandRefresh').disabled);
 assert.equal(await page.evaluate(()=>window.reloadGuardToken),'still here');
 await page.evaluate(async()=>{H3TabDraftStore.save=window.realDraftSave;await H3VideoTabState.prepareReload();});
 await page.locator('#prompt').fill('Tab A @Hero in @Room');await page.evaluate(()=>H3VideoTabState.flush());
 // Old localStorage migrations and copied sessionStorage must not claim the old job.
 await page.evaluate(()=>localStorage.setItem(projectCtrl._storageKey('active_project_id'),state.activeProjectId));
 const copied=await page.evaluate(()=>Object.fromEntries(Object.entries(sessionStorage)));
 copied['h3studio.session.v3']=JSON.stringify({server:'http://127.0.0.1:18925',results:[],active:{id:'other-tabs-running-job'}});
 const duplicate=await context.newPage();duplicate.on('pageerror',e=>errors.push(e.message));await duplicate.addInitScript(values=>{if(!sessionStorage.length)for(const [k,v]of Object.entries(values))sessionStorage.setItem(k,v);},copied);await duplicate.goto(url);await duplicate.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.nodesReady);
 assert.equal(await duplicate.locator('#prompt').inputValue(),'');assert.equal(await duplicate.evaluate(()=>state.refs.length),0);assert.equal(await duplicate.evaluate(()=>state.currentProject),null);assert.equal(await duplicate.evaluate(()=>state.running),null);assert.equal(await duplicate.locator('#generate').isEnabled(),true);
 assert.notEqual(await duplicate.evaluate(()=>state.clientId),await page.evaluate(()=>state.clientId));assert.notEqual(await duplicate.evaluate(()=>sessionId),await page.evaluate(()=>sessionId));
 const popupEvent=page.waitForEvent('popup');await page.evaluate(url=>window.open(url,'_blank'),url);const popup=await popupEvent;await popup.waitForFunction(()=>typeof projectCtrl!=='undefined'&&projectCtrl&&!state.projectLoading&&state.nodesReady);assert.equal(await popup.locator('#prompt').inputValue(),'');assert.equal(await popup.evaluate(()=>state.activeProjectId||null),null);assert.notEqual(await popup.evaluate(()=>state.clientId),await page.evaluate(()=>state.clientId));await popup.close();
 // The new tab can explicitly open a saved project, then keep its own inputs on reload.
 await duplicate.evaluate(async id=>openProjectWorkspace(id),pid);
 await duplicate.locator('.mode[data-mode=refs]').click();await duplicate.evaluate(()=>state.pendingRefKind='image');await duplicate.locator('#refFile').setInputFiles([{name:'Hero.png',mimeType:'image/png',buffer:png},{name:'Room.png',mimeType:'image/png',buffer:png}]);await duplicate.waitForFunction(()=>state.refs.length===2);
 await duplicate.locator('#prompt').fill('Duplicate has its own edits');await duplicate.evaluate(()=>H3VideoTabState.flush());await duplicate.waitForFunction(()=>document.getElementById('tabDraftStatus').textContent.includes('is saved'));
 assert.equal(await page.locator('#prompt').inputValue(),'Tab A @Hero in @Room');
 await page.locator('#projectTools').evaluate(el=>el.open=true);page.once('dialog',dialog=>dialog.accept());await page.locator('#clearTabSetup').click();await page.waitForFunction(()=>!state.projectLoading&&state.refs.length===0&&document.getElementById('tabDraftStatus').textContent.includes('is saved'));await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.currentProject);assert.equal(await page.locator('#prompt').inputValue(),'');assert.equal(await page.evaluate(()=>state.refs.length),0);assert.equal(await duplicate.evaluate(()=>state.refs.length),2);await duplicate.screenshot({path:path.join(out,'tab-restored.png')});
 // The same immutable blob can be used by copied session metadata without cross-tab writes.
 await second.evaluate(async()=>{const file=new File(['sound'],'reference.wav',{type:'audio/wav'});await H3TabDraftStore.save('isolated-test',{file,alias:'voice'});});assert.equal(await page.evaluate(()=>sessionStorage.getItem('h3.tab.setup.isolated-test')),null);assert.equal(await second.evaluate(async()=>await(await H3TabDraftStore.load('isolated-test')).file.text()),'sound');
 const imageA=await context.newPage(),imageB=await context.newPage();for(const tab of [imageA,imageB]){tab.on('pageerror',e=>errors.push(e.message));await tab.goto('http://127.0.0.1:18925/web/image.html');await tab.waitForFunction(()=>state.referencesReady);}
 await imageA.locator('#referenceFiles').setInputFiles({name:'Portrait.png',mimeType:'image/png',buffer:png});await imageA.waitForFunction(()=>state.refsSaved&&state.refs.length===1);await imageA.locator('#profile').evaluate(el=>{el.value='bf16';el.dispatchEvent(new Event('change',{bubbles:true}));});await imageA.locator('#prompt').fill('Image tab A');await imageB.locator('#prompt').fill('Image tab B');await Promise.all([imageA.reload(),imageB.reload()]);for(const tab of [imageA,imageB])await tab.waitForFunction(()=>state.referencesReady);assert.equal(await imageA.locator('#prompt').inputValue(),'Image tab A');assert.equal(await imageA.evaluate(()=>state.refs.length),1);assert.equal(await imageA.locator('#profile').inputValue(),'bf16');assert.equal(await imageB.locator('#prompt').inputValue(),'Image tab B');assert.equal(await imageB.evaluate(()=>state.refs.length),0);
 await imageA.evaluate(()=>{const save=QwenReferenceStore.save;const gate=new Promise(resolve=>window.releaseLogoWrite=resolve);QwenReferenceStore.save=async(...args)=>{await gate;return save(...args);};state.refs[0].name='logo_saved';saveDraft();window.imageLogoGuard=true;});
 await imageA.locator('#brandRefresh').click();await imageA.waitForTimeout(100);assert.equal(await imageA.evaluate(()=>window.imageLogoGuard),true);assert.equal(await imageA.locator('#brandRefresh').isDisabled(),true);
 await Promise.all([imageA.waitForEvent('load'),imageA.evaluate(()=>window.releaseLogoWrite())]);await imageA.waitForFunction(()=>state.referencesReady);assert.equal(await imageA.evaluate(()=>state.refs[0].name),'logo_saved');
 imageA.once('dialog',dialog=>dialog.accept());await imageA.locator('#clearImageSetup').click();await imageA.waitForFunction(()=>state.refsSaved&&state.refs.length===0);await imageA.reload();await imageA.waitForFunction(()=>state.referencesReady);assert.equal(await imageA.evaluate(()=>state.refs.length),0);assert.equal(await imageB.locator('#prompt').inputValue(),'Image tab B');

 const standalone=await context.newPage();standalone.on('pageerror',e=>errors.push(e.message));await standalone.goto(url+'#studio');await standalone.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.nodesReady);await standalone.locator('.mode[data-mode=refs]').click();await standalone.evaluate(()=>state.pendingRefKind='image');await standalone.locator('#refFile').setInputFiles({name:'Unsaved.png',mimeType:'image/png',buffer:png});await standalone.locator('#prompt').fill('Without a project');await standalone.evaluate(()=>H3VideoTabState.flush());await standalone.waitForFunction(()=>document.getElementById('tabDraftStatus').textContent.includes('is saved'));await standalone.reload();await standalone.waitForFunction(()=>!state.projectLoading&&state.refs.length===1);assert.equal(await standalone.locator('#prompt').inputValue(),'Without a project');assert.equal(await standalone.evaluate(()=>state.currentProject),null);
 const storageEvidence=await second.evaluate(async()=>{
  const file=new File(['immutable'],'shared.wav');await H3TabDraftStore.save('lease',{file});const metadata=JSON.parse(sessionStorage.getItem('h3.tab.setup.lease'));const id=metadata.file.__h3_file;
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('h3-tab-media',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const t=db.transaction('leases','readwrite');t.objectStore('leases').put(1,id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
  await H3TabDraftStore.save('lease',{file});await H3TabDraftStore.cleanup();const restored=await H3TabDraftStore.load('lease');const renewed=await restored.file.text()==='immutable';
  const before=sessionStorage.getItem('h3.tab.setup.lease'),realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='h3.tab.setup.lease')throw new DOMException('Injected quota','QuotaExceededError');return realSet.call(this,k,v);};let rejected=false;try{await H3TabDraftStore.save('lease',{file,changed:true});}catch{rejected=true;}finally{Storage.prototype.setItem=realSet;}
  const preserved=sessionStorage.getItem('h3.tab.setup.lease')===before;db.close();return {renewed,rejected,preserved};
 });assert.deepEqual(storageEvidence,{renewed:true,rejected:true,preserved:true});
 const failedSnapshot=await duplicate.evaluate(async()=>{
  const k='h3.tab.setup.'+tabProjectDraftKey(state.activeProjectId),json=sessionStorage.getItem(k);const value=JSON.parse(json);const id=value.refs[0].file.__h3_file;const db=await new Promise(resolve=>{const r=indexedDB.open('h3-tab-media',2);r.onsuccess=()=>resolve(r.result);});await new Promise(resolve=>{const t=db.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=resolve;});db.close();return {k,json};
 });await duplicate.reload();await duplicate.waitForFunction(()=>!state.projectLoading&&state.tabDraftRestoreError);await duplicate.waitForTimeout(1600);assert.equal(await duplicate.evaluate(k=>sessionStorage.getItem(k),failedSnapshot.k),failedSnapshot.json);assert.ok((await duplicate.locator('#tabDraftStatus').textContent()).includes('restore failed'));


 await duplicate.evaluate(async()=>{await withProjectLoading(async()=>{const p=await projectCtrl.createProject('Recovery workspace');await hydrateProjectDraft(p.draft||{mode:'text',refs:[],guides:[],prompts:{text:'Recovered workspace',frames:'',refs:''}});});setWorkspaceView('studio');await H3VideoTabState.flush();});await duplicate.waitForFunction(()=>!state.projectLoading&&document.getElementById('tabDraftStatus').textContent.includes('is saved'));assert.equal(await duplicate.evaluate(()=>state.tabDraftRestoreError),null);assert.equal(await duplicate.evaluate(k=>sessionStorage.getItem(k),failedSnapshot.k),failedSnapshot.json);
 await duplicate.evaluate(async id=>openProjectWorkspace(id),pid);await duplicate.waitForFunction(()=>!state.projectLoading&&state.tabDraftRestoreError);assert.equal(await duplicate.evaluate(k=>sessionStorage.getItem(k),failedSnapshot.k),failedSnapshot.json);
 const delayed=await standalone.evaluate(async()=>{
  const original=H3TabDraftStore.load,controller=projectCtrl,before=document.getElementById('prompt').value;let release;
  H3TabDraftStore.load=()=>new Promise((resolve,reject)=>{release=()=>reject(Error('Delayed old workspace'));});
  const pending=hydrateWorkspaceDraft(null);state.activeProjectId='new-workspace';state.tabDraftRestoreError=null;release();const result=await pending;H3TabDraftStore.load=original;state.activeProjectId=null;
  return {discarded:result===false,errorUnchanged:state.tabDraftRestoreError===null,promptUnchanged:document.getElementById('prompt').value===before};
 });assert.deepEqual(delayed,{discarded:true,errorUnchanged:true,promptUnchanged:true});
 await second.evaluate(()=>sessionStorage.setItem(baseKey,'http://127.0.0.1:18925'));assert.equal(await page.evaluate(()=>api('')),'');assert.equal(await second.evaluate(()=>api('')),'http://127.0.0.1:18925');


 const videoLeave=await standalone.evaluate(async()=>{
  const original=H3TabDraftStore.save;let release;const gate=new Promise(resolve=>release=resolve);H3TabDraftStore.save=async(...args)=>{await gate;return original(...args);};
  document.getElementById('prompt').value='Immediate video edit';const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);const guarded=event.defaultPrevented;
  H3TabDraftStore.save=original;release();await new Promise(resolve=>setTimeout(resolve,30));return guarded;
 });assert.equal(videoLeave,true);await standalone.waitForFunction(()=>document.getElementById('tabDraftStatus').textContent.includes('is saved'));assert.ok(await standalone.evaluate(()=>sessionStorage.getItem('h3.tab.setup.'+tabProjectDraftKey('unassigned')).includes('Immediate video edit')));
 const imageLeave=await imageB.evaluate(async()=>{
  const original=QwenReferenceStore.save;let release;const gate=new Promise(resolve=>release=resolve);QwenReferenceStore.save=async(...args)=>{await gate;return original(...args);};
  state.refs.push({id:crypto.randomUUID(),file:new File(['new file'],'Immediate.png',{type:'image/png'}),name:'immediate',width:1,height:1});
  const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);const guarded=event.defaultPrevented;await new Promise(resolve=>setTimeout(resolve,10));QwenReferenceStore.save=original;release();await referenceWrite;return guarded;
 });assert.equal(imageLeave,true);

 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'tab-browser-verification.json'),JSON.stringify({unsaved_media_refresh:true,roles_and_advanced_settings:true,same_project_separate_tabs:true,duplicated_session_isolation:true,clear_without_other_tab_damage:true,immutable_blob_storage:true,image_tabs_refresh_and_isolation:true,no_project_media_restore:true,image_profile_restore:true,lease_renewal:true,quota_failure_preserves_snapshot:true,failed_restore_preserves_snapshot:true,project_switch_after_failed_restore:true,delayed_restore_discarded:true,server_choice_per_tab:true,immediate_refresh_flush_and_pending_write_guard:true,page_errors:errors,gpu_submissions:0},null,2));await browser.close();console.log('Unsaved media, settings, duplicate-tab isolation and clear persistence passed for video/image; no GPU submitted.');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});



