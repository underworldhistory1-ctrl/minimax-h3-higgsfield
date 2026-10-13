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
 await page.locator('#newProjectName').fill('Thriller project');await page.locator('#projectHubCreate').click();
 await page.waitForFunction(()=>state.currentProject?.name==='Thriller project'&&!state.projectLoading);
 await page.waitForFunction(()=>!document.body.classList.contains('project-hub-open'));
 const pid=await page.evaluate(()=>state.activeProjectId);
 assert.deepEqual(await page.locator('#assetCategory option').allTextContents(),['Characters','Locations','Props','Style','Audio','Storyboards','Custom']);
 const image=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
 await page.locator('#assetCategory').selectOption('characters');
 await page.locator('#projectAssetFiles').setInputFiles(['hero','room'].map((name,i)=>({name:name+'.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([image,Buffer.from('fixture'+i)])})));
 await page.waitForFunction(()=>state.currentProject?.assets.length===2&&!workspaceCatalogBusy);
 assert.equal(await page.locator('.catalog-asset').count(),2);
 await page.locator('.catalog-asset').filter({hasText:'room.jpg'}).getByRole('button',{name:'Edit',exact:true}).click();
 await page.locator('#assetEditName').fill('Bathroom set');await page.locator('#assetEditCategory').selectOption('locations');await page.locator('#assetEditNotes').fill('Bathroom architecture only');await page.locator('#assetEditSave').click();
 await page.waitForFunction(()=>!document.getElementById('assetEditDialog').open);
 assert.equal(await page.evaluate(()=>state.currentProject.assets.find(a=>a.name==='Bathroom set').alias),'room');
 page.once('dialog',dialog=>dialog.accept('Vehicles'));await page.locator('#addAssetCategory').click();await page.waitForFunction(()=>state.currentProject.asset_categories.some(c=>c.name==='Vehicles'));
 await page.locator('#prompt').fill('Film @');await page.locator('#prompt').evaluate(input=>input.setSelectionRange(input.value.length,input.value.length));await page.locator('#prompt').dispatchEvent('input');
 await page.locator('#mentionMenu button').filter({hasText:'hero.jpg'}).click();
 await page.waitForFunction(()=>state.refs.length===1&&state.mode==='refs');assert.equal(await page.locator('#prompt').inputValue(),'Film @hero ');
 const role=await page.evaluate(()=>state.refs[0].role);assert.equal(role,'character identity');
 // Shot changes cannot silently rename reusable catalog identities.
 const merged=await page.evaluate(()=>mergeProjectAssetDescriptors(state.currentProject.assets,[{assetId:state.refs[0].assetId,alias:'shot_only',role:'custom',kind:'image'}]));assert.equal(merged.find(a=>a.alias==='hero').role,'character identity');
 // Delayed media loading must preserve edits made while it is in flight.
 let held;await page.route('**/h3_studio/lab/assets/*/file',route=>{if(route.request().resourceType()==='fetch')held=route;else route.continue();});
 await page.locator('.catalog-asset').filter({hasText:'Bathroom set'}).getByRole('button',{name:'Use',exact:true}).click();
 await page.waitForFunction(()=>workspaceCatalogBusy);await page.locator('#prompt').fill('My newer prompt');
 for(let n=0;n<100&&!held;n++)await page.waitForTimeout(20);assert.ok(held);await held.continue();await page.waitForFunction(()=>!workspaceCatalogBusy);
 assert.equal(await page.locator('#prompt').inputValue(),'My newer prompt');assert.equal(await page.evaluate(()=>state.refs.length),1);
 await page.unroute('**/h3_studio/lab/assets/*/file');
 await page.locator('#projectAssetsPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'project-assets.png'),fullPage:false});
 await page.locator('#projectsHome').click();await page.waitForFunction(()=>document.body.classList.contains('project-hub-open'));
 await page.screenshot({path:path.join(out,'project-hub.png'),fullPage:false});
 page.once('dialog',dialog=>dialog.accept('Renamed thriller'));await page.locator('[data-project-id="'+pid+'"]').getByRole('button',{name:'Rename',exact:true}).click();await page.waitForFunction(()=>state.currentProject?.name==='Renamed thriller');
 await page.locator('#newProjectName').fill('Second project');await page.locator('#projectHubCreate').click();await page.waitForFunction(()=>state.currentProject?.name==='Second project'&&!state.projectLoading);
 assert.equal(await page.locator('.catalog-asset').count(),0);assert.equal(await page.locator('#prompt').inputValue(),'');
 await page.locator('#projectsHome').click();await page.waitForFunction(()=>document.body.classList.contains('project-hub-open'));
 await page.locator('[data-project-id="'+pid+'"]').getByRole('button',{name:'Open',exact:true}).click();await page.waitForFunction(()=>state.activeProjectId===localStorage.getItem(projectCtrl._storageKey('active_project_id'))&&state.currentProject?.name==='Renamed thriller'&&!state.projectLoading);
 assert.equal(await page.evaluate(()=>state.activeProjectId),pid);assert.equal(await page.locator('#prompt').inputValue(),'My newer prompt');assert.equal(await page.evaluate(()=>state.refs.length),1);
 assert.equal(await page.locator('.catalog-asset').count(),2);
 await page.reload();await page.waitForFunction(()=>state.currentProject?.name==='Renamed thriller'&&!state.projectLoading);assert.equal(await page.evaluate(()=>state.currentProject.assets.length),2);
 await page.locator('[data-project-id="'+pid+'"]').getByRole('button',{name:'Open',exact:true}).click();await page.waitForFunction(()=>!state.projectLoading&&!document.body.classList.contains('project-hub-open'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'project-assets-mobile.png'),fullPage:false});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({project_id:pid,project_names:true,categories:8,multi_upload:true,mentions:true,prompt_race_preserved:true,reopen:true,refresh:true,errors,no_gpu_render:true},null,2));
 console.log('Real project and asset APIs + browser navigation passed; no GPU inference.');await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
