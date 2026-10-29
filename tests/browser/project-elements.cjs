/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;
 if(url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
 if(url.pathname.startsWith('/object_info/')){const name=url.pathname.split('/').pop();data={[name]:schemas[name]||{input:{required:{}}}};}
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


 await page.goto('http://127.0.0.1:18925/web/index.html');
 await page.waitForFunction(()=>projectCtrl&&!state.projectLoading);
 let creates=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/h3_studio/lab/projects')creates++;});
 await page.locator('[data-workspace-nav=projects]').click();
 await page.locator('#newProjectName').fill('Elements integrity');
 await page.evaluate(()=>{document.getElementById('projectHubCreate').click();document.getElementById('projectHubCreate').click();});
 await page.waitForFunction(()=>state.currentProject?.name==='Elements integrity'&&!state.projectLoading);
 assert.equal(creates,1,'A rapid double click creates one project');
 const pid=await page.evaluate(()=>state.activeProjectId);
 const image=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
 const picture=name=>({name,mimeType:'image/jpeg',buffer:Buffer.concat([image,Buffer.from(name)])});
 await page.locator('[data-workspace-nav=elements]').click();
 await page.locator('#assetCategory').selectOption('characters');
 await page.locator('#projectAssetFiles').setInputFiles([picture('Hero.jpg'),picture('hero.jpg')]);
 await page.waitForFunction(()=>state.currentProject.assets.length===2&&!workspaceLocked());
 const aliases=await page.evaluate(()=>state.currentProject.assets.map(asset=>asset.alias.toLowerCase()));assert.equal(new Set(aliases).size,2);
 await page.locator('.catalog-asset').first().getByRole('button',{name:'Use',exact:true}).click();
 await page.waitForFunction(()=>state.refs.length===1&&!workspaceLocked());
 await page.locator('#prompt').fill('A portrait of @Hero.');await page.locator('#btnSaveProject').click();
 await page.waitForFunction(()=>!workspaceLocked()&&state.refs[0].assetId);
 const oldId=await page.evaluate(()=>state.refs[0].assetId),alias=await page.evaluate(()=>state.refs[0].alias);
 const card=page.locator('#refs details').first();assert.equal(await card.getAttribute('open'),null);
 // A corrupt replacement must preserve the old input and position.
 let [picker]=await Promise.all([page.waitForEvent('filechooser'),card.getByRole('button',{name:'Replace',exact:true}).click()]);
 await picker.setFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
 await page.waitForFunction(()=>!state.projectLoading);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),oldId);
 // A valid replacement works without expanding the card and keeps the mention.
 [picker]=await Promise.all([page.waitForEvent('filechooser'),card.getByRole('button',{name:'Replace',exact:true}).click()]);
 await picker.setFiles(picture('replacement.jpg'));
 await page.waitForFunction(()=>!state.projectLoading&&state.refs[0].file.name==='replacement.jpg');
 assert.equal(await page.evaluate(()=>state.refs.length),1);assert.equal(await page.evaluate(()=>state.refs[0].alias),alias);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),null);
 await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>!workspaceLocked()&&state.refs[0].assetId);
 const savedId=await page.evaluate(()=>state.refs[0].assetId);assert.notEqual(savedId,oldId);
 await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.refs[0]?.assetId);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),savedId);assert.equal(await page.evaluate(()=>state.refs[0].alias),alias);
 // Capture a historical take; element replacement must keep it portable.
 await page.evaluate(async()=>{const project=projectCtrl.currentProject;project.takes=[{take_id:'historical',draft:captureProjectDraft()}];const saved=await projectCtrl.fetchJson('/h3_studio/lab/projects/'+project.project_id,{method:'POST',body:JSON.stringify({project,expected_revision:project.revision})});projectCtrl.currentProject=saved;updateProjectUI(saved);});
 await page.locator('[data-workspace-nav=elements]').click();
 let row=page.locator('.catalog-asset').filter({hasText:'replacement.jpg'});assert.equal(await row.count(),1);
 [picker]=await Promise.all([page.waitForEvent('filechooser'),row.getByRole('button',{name:'Replace image',exact:true}).click()]);await picker.setFiles(picture('element-new.jpg'));
 await page.waitForFunction(id=>!workspaceLocked()&&state.refs[0].assetId!==id,savedId);
 const replacedId=await page.evaluate(()=>state.refs[0].assetId);
 assert.equal(await page.evaluate(()=>state.currentProject.takes[0].draft.refs[0].assetId),savedId);
 assert.equal(await page.evaluate(id=>state.currentProject.assets.filter(asset=>asset.asset_id===id).length,savedId),0);
 assert.equal(await page.evaluate(()=>state.currentProject.archived_assets[0].asset_id),savedId);
 const bundle=await page.request.get('http://127.0.0.1:18925/h3_studio/lab/projects/'+pid+'/export');assert.equal(bundle.status(),200,await bundle.text());
 await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.refs[0]?.assetId);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),replacedId);
 // Restored history remains its original image after autosave and reload.
 await page.evaluate(()=>restoreProjectTake(state.currentProject.takes[0]));
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),savedId);
 await page.evaluate(()=>H3VideoTabState.flush(true));await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.refs[0]?.assetId);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),savedId);
 // Return to the edited draft to continue testing replacement of the current element.
 await page.evaluate(async()=>{await withProjectLoading(()=>hydrateProjectDraft(projectCtrl.currentProject.draft));await H3VideoTabState.flush(true);});
 // A lost acknowledgement is reconciled by reading the exact completed swap.
 let lostReplies=0;
 await page.route('**/h3_studio/lab/projects/*/workspace',async route=>{await route.fetch();lostReplies++;await route.abort('failed');});
 await page.evaluate(async()=>{const ref=state.refs[0],file=new File([ref.file,'lost-ack'],'ack.jpg',{type:'image/jpeg'});await replaceProjectElement(projectCatalogItems().find(item=>item.assetId===ref.assetId),file);});
 assert.equal(lostReplies,1,'A lost acknowledgement must not resubmit the replacement');
 await page.unroute('**/h3_studio/lab/projects/*/workspace');
 // Replacing B with original A must not create an alias/asset cycle.
 await page.evaluate(async old=>{const ref=state.refs[0],blob=await projectCtrl.mediaBlob(old);const item=projectCatalogItems().find(item=>item.assetId===ref.assetId);await replaceProjectElement(item,new File([blob],'restore-original.jpg',{type:'image/jpeg'}));},savedId);
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),savedId);
 await page.reload();await page.waitForFunction(()=>!state.projectLoading&&state.refs[0]?.assetId);assert.equal(await page.evaluate(()=>state.refs[0].assetId),savedId);
 // Failed server uploads preserve original; no partial catalog entry appears.
 await page.route('**/h3_studio/lab/assets?*',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'Upload offline fixture'}}):route.continue());
 const before=await page.evaluate(()=>state.refs[0].assetId);
 await page.evaluate(async()=>{try{await replaceProjectElement(projectCatalogItems().find(item=>item.assetId===state.refs[0].assetId),new File([state.refs[0].file],'offline.jpg',{type:'image/jpeg'}));}catch(error){if(!/offline/i.test(error.message))throw error;}});
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),before);await page.unroute('**/h3_studio/lab/assets?*');
 // Retrying project creation after its response is lost recovers one project.
 let lostCreates=0;const retryName='Retry-safe creation '+Date.now();
 await page.route('**/h3_studio/lab/projects',async route=>{if(route.request().method()==='POST'){await route.fetch();lostCreates++;await route.abort('failed');}else await route.continue();});
 await page.evaluate(async name=>{try{await createWorkspaceProject(name);}catch{}},retryName);
 assert.equal(await page.evaluate(()=>state.activeProjectId),pid);
 await page.unroute('**/h3_studio/lab/projects');
 await page.evaluate(name=>createWorkspaceProject(name),retryName);
 const allProjects=await (await page.request.get('http://127.0.0.1:18925/h3_studio/lab/projects')).json();
 assert.equal(allProjects.projects.filter(project=>project.name===retryName).length,1);
 assert.equal(await page.evaluate(()=>state.refs.length),0,'A retried new project does not inherit the previous shot');assert.equal(lostCreates,1);
 await page.evaluate(id=>openProjectWorkspace(id),pid);
 // Audio/video disclosure never tries to load an image-only preview.
 await page.locator('[data-workspace-nav=studio]').click();
 await page.evaluate(()=>{state.refs.push({kind:'audio',alias:'voice',file:new File(['audio'],'voice.wav'),role:'voice'},{kind:'video',alias:'clip',file:new File(['video'],'clip.mp4'),role:'motion'});renderRefs();});
 await page.locator('#refs details').nth(1).locator('summary').click();await page.locator('#refs details').nth(2).locator('summary').click();
 // Bound DOM work for a large reusable element catalog.
 await page.evaluate(()=>{const asset=state.currentProject.assets[0];state.currentProject={...state.currentProject,assets:Array.from({length:200},(_,i)=>({...asset,asset_id:'fixture-'+i,alias:'element'+i,name:'Element '+i}))};renderProjectCatalog();});
 assert.equal(await page.locator('.catalog-asset').count(),60);
 await page.locator('[data-workspace-nav=elements]').click();
 await page.getByRole('button',{name:'Show next 60 elements'}).click();assert.equal(await page.locator('.catalog-asset').count(),120);
 await page.locator('#assetSearch').fill('Element 199');await page.waitForFunction(()=>document.querySelectorAll('.catalog-asset').length===1);
 assert.ok((await page.locator('#assetLibraryCount').innerText()).includes('1 / 1'));
 await page.locator('[data-workspace-nav=studio]').click();
 await page.setViewportSize({width:390,height:844});await page.locator('#refs details').first().locator('summary').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/project-elements-replace-mobile.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('PASS: project double-submit, unique aliases, visible shot replacement, corrupt/offline retention, saved restore, element replacement/history/export, return-to-original and mobile disclosures. Real local APIs; no GPU job.');await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
