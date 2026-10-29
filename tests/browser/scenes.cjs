/* Self-contained local acceptance. Starts ephemeral real API storage; all render requests are rejected before the backend. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser,server,page;const submissions=[];let base;
async function stop(){if(browser)await browser.close();if(server){if(base)await fetch(base+'/__scenes_fixture_stop',{method:'POST'}).catch(()=>{});if(server.exitCode===null)await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(server.exitCode===null)server.kill();}}

(async()=>{
 fs.mkdirSync(out,{recursive:true});
 server=spawn(process.env.PYTHON||'python',['-u',path.join(__dirname,'scenes_server.py')],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',b=>{serverLog+=b;const match=serverLog.match(/SCENES_FIXTURE_URL=(http:\/\/127\.0\.0\.1:\d+)/);if(match)base=match[1];});server.stderr.on('data',b=>serverLog+=b);
 const deadline=Date.now()+30000;while(true){if(server.exitCode!==null)throw Error('Fixture stopped: '+serverLog);try{if(base){const r=await fetch(base+'/web/index.html');if(r.ok)break;}}catch{}if(Date.now()>deadline)throw Error('Fixture startup timeout: '+serverLog);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;
 if(url.origin!==base)return route.abort();if(url.pathname==='/h3_studio/lab/jobs'&&route.request().method()==='POST'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Captured setup; no GPU submission.'}});}
 if(url.pathname.startsWith('/h3_studio/lab/organization')||url.pathname.startsWith('/h3_studio/lab/videos/reuse')||url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
 if(url.pathname.startsWith('/object_info/')){const name=url.pathname.split('/').pop();data={[name]:schemas[name]||{input:{required:{}}}};}
 else if(url.pathname==='/system_stats')data={devices:[{name:'UI fixture · no inference'}]};
 else if(url.pathname==='/h3_studio/readiness')data={models:{fl2va:true,ref2va:true,text_encoder:true,video_vae:true,audio_vae:true},nodes:Object.fromEntries(['UNETLoader','MiniMaxH3SigmaShift','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','ConditioningZeroOut','KSampler','VAEDecode','VAEDecodeAudio','CreateVideo','H3SaveVideo','H3ReleaseForDecode','H3LoadSavedLatent','SaveVideo','LoadImage','LoadVideo','GetVideoComponents','LoadAudio','LoraLoaderModelOnly','SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache','ImageCrop','ImageScale','ImageFromBatch','TrimAudioDuration'].map(x=>[x,true])),quality:{h3_vae_tile_fix:true}};
 else if(url.pathname==='/h3_studio/lab/capabilities')data=caps;
 else if(url.pathname==='/h3_studio/lab/prompt/status')data={configured:false,reason:'Browser fixture: prompt AI not connected.'};
 else if(url.pathname==='/h3_studio/loras')data={items:['h3_character_swap_pro4500_1000.safetensors','h3-realism-people-t2v-i2v-r2v.safetensors']};
 else if(url.pathname==='/queue')data={queue_running:[],queue_pending:[]};
 else if(url.pathname==='/history')data={};
 else if(url.pathname.startsWith('/h3_studio/'))data=url.pathname.includes('library')?{videos:[]}:url.pathname.includes('projects')?{projects:[]}:{samples:[],contexts:[]};
 if(data!==undefined)return route.fulfill({json:data});return route.continue();
 });


 class ScenePage {
  constructor(page){this.page=page;this.panel=page.locator('#scenesPanel');}
  async ready(){await this.page.waitForFunction(()=>projectCtrl&&!state.projectLoading&&!workspaceLocked());await this.panel.waitFor({state:'attached'});}
  async named(button,name,container=this.panel){await container.getByRole('button',{name:button,exact:true}).click();await this.page.locator('#workspaceNameInput').fill(name);await this.page.locator('#workspaceNameDialog').getByRole('button',{name:'Save name',exact:true}).click();await this.ready();await this.page.waitForFunction(n=>Array.from(document.querySelectorAll('#scenesPanel button')).some(b=>b.textContent===n&&b.getAttribute('aria-pressed')==='true'&&!b.disabled),name);await this.ready();}
  async select(name){await this.panel.getByRole('button',{name,exact:true}).click();await this.ready();await this.page.waitForFunction(n=>Array.from(document.querySelectorAll('#scenesPanel button')).some(b=>b.textContent===n&&b.getAttribute('aria-pressed')==='true')||n==='Legacy content',name);}
  async action(name,action,replacement){const menu=this.panel.getByLabel('Actions for '+name,{exact:true});await menu.click();const group=menu.locator('..');if(replacement)await this.named(action,replacement,group);else{await group.getByRole('button',{name:action,exact:true}).click();await this.ready();}}
  async edit(prompt,seed){await this.page.locator('#prompt').fill(prompt);await this.page.locator('#seed').evaluate(el=>el.closest('details').open=true);await this.page.locator('#seed').fill(seed);}
  async check(prompt,seed){assert.equal(await this.page.locator('#prompt').inputValue(),prompt);assert.equal(await this.page.locator('#seed').inputValue(),seed);}
 }
 const ui=new ScenePage(page);const get=async id=>(await page.request.get(base+'/h3_studio/lab/projects/'+id)).json();
 const put=async project=>{const r=await page.request.post(base+'/h3_studio/lab/projects/'+project.project_id,{data:{project,expected_revision:project.revision}});assert.ok(r.ok(),await r.text());return r.json();};
 await page.goto(base+'/web/index.html');await ui.ready();
 await page.locator('[data-workspace-nav=projects]').click();await page.locator('#newProjectName').fill('Scenes browser acceptance');await page.locator('#projectHubCreate').click();await page.waitForFunction(()=>state.currentProject?.name==='Scenes browser acceptance'&&!state.projectLoading);await ui.ready();
 const id=await page.evaluate(()=>state.activeProjectId);assert.deepEqual((await get(id)).scenes,[]);assert.equal(await ui.panel.getByRole('button',{name:'Create Shot',exact:true}).count(),0);
 await page.locator('#projectTools').evaluate(el=>el.open=true);await page.locator('#openSceneBrowser').click();
 await ui.edit('Legacy untouched prompt','100');
 await ui.named('Create Scene','Arrival');await page.waitForFunction(()=>state.currentProject.scenes.length===1);assert.deepEqual((await get(id)).scenes[0].shots,[]);
 await ui.named('Create Shot','Wide');await ui.edit('Arrival wide framing','111');
 const first=await page.evaluate(()=>({...projectCtrl.draftScope}));
 await ui.named('Create Shot','Close');await ui.edit('Arrival close framing','222');
 await ui.named('Create Scene','Departure');await ui.named('Create Shot','Exit');await ui.edit('Departure exit framing','333');
 const second=await page.evaluate(()=>({...projectCtrl.draftScope}));
 await ui.select('Arrival');await ui.check('Arrival wide framing','111');await ui.select('Close');await ui.check('Arrival close framing','222');await ui.select('Departure');await ui.check('Departure exit framing','333');
 await page.reload();await ui.ready();await ui.check('Departure exit framing','333');assert.deepEqual(await page.evaluate(()=>projectCtrl.draftScope),second);
 await ui.select('Legacy content');await ui.check('Legacy untouched prompt','100');await ui.select('Arrival');await ui.check('Arrival wide framing','111');
 // Attach one project asset in Wide only, using the actual asset catalog UI.
 await page.locator('[data-workspace-nav=elements]').click();await page.locator('#assetCategory').selectOption('characters');
 await page.locator('#projectAssetFiles').setInputFiles({name:'Hero.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'))});await page.waitForFunction(()=>state.currentProject.assets.length===1&&!workspaceCatalogBusy);
 const aid=await page.evaluate(()=>state.currentProject.assets[0].asset_id);
 await page.locator('[data-workspace-nav=studio]').click();
 await page.evaluate(async assetId=>{selectMode('refs');await activateProjectAsset(projectCatalogItems().find(a=>a.assetId===assetId));},aid);
 await ui.edit('Arrival @hero identity','111');await ui.select('Close');assert.equal(await page.evaluate(()=>state.refs.length),0);await ui.select('Wide');assert.equal(await page.evaluate(()=>state.refs[0]?.assetId),aid);
 await ui.select('Departure');assert.equal(await page.evaluate(()=>state.refs.length),0);await ui.check('Departure exit framing','333');
 await ui.action('Exit','Rename','Gate exit');await ui.action('Gate exit','Duplicate','Gate alternate');await ui.check('Departure exit framing','333');
 let project=await get(id);let departure=project.scenes.find(s=>s.scene_id===second.scene_id);assert.equal(departure.shots.length,2);assert.notEqual(departure.shots[0].shot_id,departure.shots[1].shot_id);
 await ui.action('Gate alternate','Move earlier');await page.waitForFunction(()=>state.currentProject.scenes.find(s=>s.name==='Departure').shots[0].name==='Gate alternate');
 await ui.action('Departure','Duplicate','Departure copy');assert.equal((await get(id)).scenes.length,3);assert.equal(((await get(id)).takes||[]).length,0);
 await ui.action('Departure copy','Move earlier');await page.waitForFunction(()=>state.currentProject.scenes[1].name==='Departure copy');
 page.on('dialog',dialog=>dialog.accept());await ui.action('Departure copy','Delete');await page.waitForFunction(()=>state.currentProject.scenes.length===2);
 // Save conflict must retain the unsaved editor and selected scope.
 await ui.select('Arrival');await ui.edit('Unsaved conflict stays here','444');const conflictScope=await page.evaluate(()=>({...projectCtrl.draftScope}));
 project=await get(id);project.scenes.find(s=>s.scene_id===conflictScope.scene_id).shots.find(s=>s.shot_id===conflictScope.shot_id).draft.prompts.refs='External conflicting edit';await put(project);
 
 await ui.panel.getByRole('button',{name:'Departure',exact:true}).click();await page.waitForFunction(()=>document.getElementById('error').textContent.includes('changed on another device'));await ui.ready();await ui.check('Unsaved conflict stays here','444');assert.deepEqual(await page.evaluate(()=>projectCtrl.draftScope),conflictScope);
 // Reload retains the local edit; resolve it explicitly, then seed a legacy completed take.
 await page.reload();await ui.ready();await ui.edit('Arrival @hero identity','111');await ui.select('Departure');project=await get(id);
 const legacyDraft={mode:'refs',canvas:{width:864,height:480},prompts:{text:'',frames:'',refs:'Legacy @hero reusable take prompt'},refs:[{assetId:aid,alias:'hero',kind:'image',role:'character identity'}],guides:[],controlInputs:{},settings:{seed:'555',duration:'73',durationSeconds:'3',steps:'20',renderMethod:'native',refSize:'match'},configuration:{modelProfile:'original',sampling:{sampler_name:'euler',scheduler:'normal',shift_video:10,shift_audio:2}},preparationMode:'native',loras:[]};
 project.takes=[{take_id:'123abc456def',clip_id:'legacyclip',status:'completed',output_file:'video/h3_studio_123abc456def_00001_.mp4',draft:legacyDraft,effective_settings:{seed:'555',frames:73,canvas:'864×480',render_method:'native'}}];await put(project);
 await page.reload();await ui.ready();await ui.select('Departure');const reuseScope=await page.evaluate(()=>({...projectCtrl.draftScope}));
 // Explicit API Reuse applies the returned saved draft; ordinary refresh prefers unsaved tab edits.
 await page.evaluate(async()=>{const scope=projectCtrl.draftScope;const result=await projectCtrl.fetchJson('/h3_studio/lab/videos/reuse',{method:'POST',body:JSON.stringify({output_file:'video/h3_studio_123abc456def_00001_.mp4',target_project_id:state.activeProjectId,expected_revision:state.currentProject.revision,target_scene_id:scope.scene_id,target_shot_id:scope.shot_id})});projectCtrl.currentProject=result.project;updateProjectUI(result.project);await withProjectLoading(async()=>{await H3VideoTabState.settle();await hydrateProjectDraft(H3Scenes.draft(result.project,scope));await H3TabDraftStore.save(tabProjectDraftKey(state.activeProjectId),captureProjectDraft(true));});});
 await ui.check('Legacy @hero reusable take prompt','555');assert.deepEqual(await page.evaluate(()=>projectCtrl.draftScope),reuseScope);assert.equal(submissions.length,0);
 project=await get(id);assert.deepEqual(project.takes[0].draft,legacyDraft);assert.equal(project.draft.prompts.text,'Legacy untouched prompt');assert.equal(project.scenes.find(s=>s.scene_id===reuseScope.scene_id).shots.find(s=>s.shot_id===reuseScope.shot_id).draft.prompts.refs,'Legacy @hero reusable take prompt');
 await ui.select('Arrival');await ui.check('Arrival @hero identity','111');assert.equal(await page.evaluate(()=>state.refs[0]?.assetId),aid);await ui.select('Departure');await ui.check('Legacy @hero reusable take prompt','555');
 assert.equal(await page.evaluate(()=>state.refs.length),1);
 await ui.edit('Edited @hero prompt after Reuse','556');
 await page.locator('#loraList').evaluate(el=>el.closest('details').open=true);await page.locator('#loraList').getByRole('checkbox',{name:/Realism People/}).check();
 const styleFile=process.env.H3_STYLE_REFERENCE||path.join(root,'docs/demo/superman/storyboard-reference-preview.jpg');
 await page.evaluate(()=>state.pendingRefKind='image');
 await page.locator('#refFile').setInputFiles({name:'style.png',mimeType:'image/png',buffer:fs.readFileSync(styleFile)});
 await page.evaluate(()=>{const ref=state.refs.at(-1);ref.alias='66';ref.role='custom';ref.instruction='Use only cinematic lighting, color grading and visual style. Do not copy people, guns or action.';renderRefs();});
 await page.locator('#estimates').getByRole('button',{name:/Full HD generation.*1920×1080/}).click();
 // The custom card instruction supplies the use of @66 without duplicating it in prose.
 // Explicit Generate is captured and rejected before reaching the fixture backend.
 const capturedJob=page.waitForResponse(r=>r.url()===base+'/h3_studio/lab/jobs'&&r.request().method()==='POST');await page.locator('#generate').click();await capturedJob;await page.waitForFunction(()=>!state.busy);assert.equal(submissions.length,1,await page.locator('#error').textContent());
 const submitted=submissions[0],snapshot=submitted.render_spec.project_snapshot;assert.equal(snapshot.scene_id,reuseScope.scene_id);assert.equal(snapshot.shot_id,reuseScope.shot_id);assert.equal(snapshot.clip_id,reuseScope.shot_id);assert.equal(submitted.project_id,id);assert.equal(submitted.render_spec.source_prompt,'Edited @hero prompt after Reuse');assert.equal(snapshot.draft.prompts.refs,'Edited @hero prompt after Reuse');assert.equal(snapshot.draft.refs.length,2);assert.equal(snapshot.draft.refs[1].alias,'66');assert.equal(snapshot.draft.refs[1].role,'custom');assert.ok(snapshot.draft.refs[1].assetId);assert.ok(snapshot.settings.references[1].asset_id);assert.equal(snapshot.draft.canvas.width,1920);assert.equal(snapshot.draft.canvas.height,1080);const graphText=JSON.stringify(submitted.render_spec.workflow);assert.match(graphText,/r34l1sm/);assert.match(graphText,/cinematic lighting, color grading/);assert.equal(submitted.render_spec.loras[0].enabled,true);assert.equal(String(snapshot.settings.seed),'556');
 // A gateway failure must keep a visible, durable missing-reference descriptor.
 await page.route('**/h3_studio/lab/assets/'+aid+'/file',route=>route.fulfill({status:503,body:'Temporary gateway error'}));
 await page.evaluate(async()=>{projectCtrl.assetMedia.clear();projectCtrl.mediaBytes=0;const draft=captureProjectDraft();await withProjectLoading(()=>hydrateProjectDraft(draft));});
 assert.equal(await page.evaluate(()=>state.refs[0].assetId),aid);assert.ok(await page.evaluate(()=>state.refs[0].restoreError));assert.equal(await page.locator('#refs').getByRole('button',{name:'Retry reference download'}).count(),1);
 await page.evaluate(()=>withProjectLoading(saveWorkspaceDraft));const failedSaved=await get(id);assert.equal(failedSaved.scenes.find(s=>s.scene_id===reuseScope.scene_id).shots.find(s=>s.shot_id===reuseScope.shot_id).draft.refs[0].assetId,aid);
 await page.unroute('**/h3_studio/lab/assets/'+aid+'/file');await ui.edit('Latest edit survives retry','557');await page.locator('#refs').getByRole('button',{name:'Retry reference download'}).click();await page.waitForFunction(()=>!state.projectLoading&&!state.refs.some(ref=>ref.restoreError));await ui.check('Latest edit survives retry','557');assert.equal(await page.evaluate(()=>state.refs.length),2);
 // A take assigned to the selected shot protects it from deletion.
 project=await get(id);project.takes.push({...project.takes[0],take_id:'fedcba654321',scene_id:reuseScope.scene_id,shot_id:reuseScope.shot_id,clip_id:reuseScope.shot_id});await put(project);await page.reload();await ui.ready();
 const protectedDelete=page.waitForResponse(r=>r.url().endsWith('/workspace')&&r.request().method()==='POST'&&r.status()>=400);await ui.action('Gate alternate','Delete');await protectedDelete;assert.ok((await get(id)).scenes.find(s=>s.scene_id===reuseScope.scene_id).shots.some(s=>s.shot_id===reuseScope.shot_id));
 await page.screenshot({path:path.join(out,'scenes-acceptance.png'),fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'scenes-verification.json'),JSON.stringify({empty_project:true,named_scenes:2,multiple_shots:true,prompt_seed_switch_refresh:true,reference_isolation:true,rename_duplicate_reorder:true,protected_delete:true,revision_conflict_retains_editor:true,legacy_retained:true,reuse_selected_shot:true,immutable_submission_scope:true,reuse_materials:true,edited_prompt_submission:true,custom_style_66:true,automatic_lora_trigger:true,failed_reference_saved_and_retried:true,automatic_submissions:0,gpu_submissions:0,errors},null,2));
 await stop();console.log('Scenes browser acceptance passed: create, draft/reference isolation, refresh, CRUD, conflict retention, Reuse and submission ownership; GPU submissions 0.');
})().catch(async error=>{console.error(error);if(page){try{fs.writeFileSync(path.join(out,'scenes-failure-state.json'),JSON.stringify(await page.evaluate(()=>({local:Object.fromEntries(Object.entries(sessionStorage)),server:state.currentProject,scope:projectCtrl?.draftScope,project:state.currentProject?.name,panel:document.getElementById('scenesPanel')?.outerHTML,error:document.getElementById('error')?.textContent})),null,2));await page.screenshot({path:path.join(out,'scenes-failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'scenes-failure-dom.txt'),await page.locator('body').innerText());}catch{}}await stop();process.exitCode=1;});



