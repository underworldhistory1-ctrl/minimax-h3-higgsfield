/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={dials_ready:true,dial_files:['dials/h3_motion.safetensors'],turbo_ready:true,turbo_ref_ready:true,audio_refine_ready:true,server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler','h3_turbo'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser,debugPage;const submissions=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});debugPage=page;page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;if(url.pathname==='/h3_studio/lab/jobs'&&route.request().method()==='POST'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Captured setup; no GPU submission.'}});}
 if(url.pathname.startsWith('/h3_studio/lab/organization')||url.pathname.startsWith('/h3_studio/lab/videos/reuse')||url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
 if(url.pathname.startsWith('/object_info/')){const name=url.pathname.split('/').pop();data={[name]:schemas[name]||{input:{required:{}}}};}
 else if(url.pathname==='/system_stats')data={devices:[{name:'UI fixture · no inference'}]};
 else if(url.pathname==='/h3_studio/readiness')data={models:{fl2va:true,ref2va:true,text_encoder:true,video_vae:true,audio_vae:true},nodes:Object.fromEntries(['UNETLoader','MiniMaxH3SigmaShift','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','ConditioningZeroOut','KSampler','VAEDecode','VAEDecodeAudio','CreateVideo','H3SaveVideo','H3ReleaseForDecode','H3LoadSavedLatent','SaveVideo','LoadImage','LoadVideo','GetVideoComponents','LoadAudio','LoraLoaderModelOnly','SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache','ImageCrop','ImageScale','ImageFromBatch','TrimAudioDuration'].map(x=>[x,true])),quality:{h3_vae_tile_fix:true}};
 else if(url.pathname==='/h3_studio/lab/capabilities')data=caps;
 else if(url.pathname==='/h3_studio/lab/prompt/status')data={configured:false,reason:'Browser fixture: prompt AI not connected.'};
 else if(url.pathname==='/h3_studio/loras')data={items:[...Object.keys(C.PIKA),'h3_character_swap_pro4500_1000.safetensors']};
 else if(url.pathname==='/queue')data={queue_running:[],queue_pending:[]};
 else if(url.pathname==='/history')data={};
 else if(url.pathname.startsWith('/h3_studio/'))data=url.pathname.includes('library')?{videos:[]}:url.pathname.includes('projects')?{projects:[]}:{samples:[],contexts:[]};
 if(data!==undefined)return route.fulfill({json:data});return route.continue();
 });


 await page.goto('http://127.0.0.1:18925/web/index.html');await page.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.nodesReady);
 await page.locator('[data-workspace-nav=projects]').click();await page.locator('#newProjectName').fill('Audio production');await page.locator('#projectHubCreate').click();await page.waitForFunction(()=>!state.projectLoading&&workspaceView==='studio');

 await page.locator('#dialsPanel').evaluate(el=>el.open=true);await page.locator('[data-dial="dials/h3_motion.safetensors"] input[type=checkbox]').check();
 await page.locator('[aria-label="Dial strength h3_motion"]').fill('0.75');await page.locator('[aria-label="Dial strength h3_motion"]').dispatchEvent('change');
 assert.equal(await page.evaluate(()=>currentRenderSpec().dials[0].strength),.75);
 await page.locator('[aria-label="Dial strength h3_motion"]').fill('21');await page.locator('[aria-label="Dial strength h3_motion"]').dispatchEvent('change');assert.equal(await page.locator('[aria-label="Dial strength h3_motion"]').inputValue(),'0.75');
 const dialGraph=await page.evaluate(()=>H3GraphBuilder.buildGraph({...currentRenderSpec(),mode:'text'}, {},state.labCapabilities));assert.equal(Object.values(dialGraph).find(n=>n.class_type==='DialsApplyDial').inputs.strength,.75);
 await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.currentProject.draft?.configuration?.dials?.[0]?.strength===.75);
 await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&!state.projectLoading&&state.dials?.[0]?.strength===.75);
 await page.locator('#dialsPanel').evaluate(el=>el.open=true);assert.ok(await page.locator('[data-dial="dials/h3_motion.safetensors"] input[type=checkbox]').isChecked());
 const pika='pika_h3_flex_turbo_4step_fl2va.safetensors';
 await page.evaluate(()=>{state.loras=Object.keys(H3Configuration.PIKA).map(name=>({name,enabled:false,strength:1}));state.loras.push({name:H3Configuration.CHARACTER_SWAP,enabled:false,strength:1});renderLoras();});
 await page.locator('#modelProfile').selectOption('singularity');await page.waitForTimeout(50);
 await page.locator('#samplingControls').evaluate(el=>el.open=true);await page.locator('[data-setting=weight_dtype]').selectOption('fp8_e4m3fn');
 await page.locator('#enableRefine').check();
 await page.locator('#loraList').evaluate(el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
 const pikaToggle=page.locator('#loraList .ref').filter({hasText:pika}).locator('input[type=checkbox]');
 await pikaToggle.check();await page.waitForTimeout(50);
 assert.equal(await page.locator('#modelProfile').inputValue(),'original');assert.equal(await page.locator('#steps').inputValue(),'4');assert.ok(await page.locator('#steps').isDisabled());assert.ok(!await page.locator('#enableRefine').isChecked());assert.ok(await page.locator('#enableRefine').isDisabled());
 await page.locator('#samplingControls').evaluate(el=>el.open=true);await page.locator('#resetSampling').click();assert.equal(await page.evaluate(()=>state.sampling.sampler_name),'euler');assert.ok(await page.locator('[data-setting=cfg]').isDisabled());
 await page.locator('#modelProfile').selectOption('hybrid_loader');await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>state.sampling.weight_dtype),'default');await pikaToggle.check();
 await page.locator('.mode[data-mode=refs]').click();await page.waitForTimeout(50);assert.ok(await page.evaluate(()=>state.loras.some(l=>l.enabled&&l.name==='pika_h3_flex_turbo_4step_ref2va.safetensors')));assert.equal(await page.evaluate(()=>state.sampling.shift_video),12);
 // Restore atomically over a Pika draft; previous preset snapshots must not replace saved values.
 await page.evaluate(async()=>{const draft=emptyWorkspaceDraft();draft.mode='refs';draft.settings={...draft.settings,steps:24};draft.configuration={sampling:{sampler_name:'euler',shift_video:9,cfg:2},modelProfile:'original'};await hydrateProjectDraft(draft);});
 assert.equal(await page.locator('#steps').inputValue(),'24');assert.equal(await page.evaluate(()=>state.sampling.shift_video),9);assert.equal(await page.evaluate(()=>state.pikaBefore),undefined);
 // Saved incompatible intent remains visible and can always be corrected by unchecking.
 await page.evaluate(()=>{state.control={enabled:true};$('enableControl').checked=true;$('enableRefine').checked=true;renderContinuation();});
 assert.ok(await page.locator('#generate').isDisabled());assert.ok(await page.locator('#enableRefine').isEnabled());assert.ok(await page.locator('#enableControl').isEnabled());
 await page.locator('#enableRefine').uncheck();await page.locator('#enableControl').evaluate(el=>el.closest('details').open=true);await page.locator('#enableControl').uncheck();
 await page.locator('.mode[data-mode=text]').click();await page.locator('#renderMethod').selectOption('turbo');await page.locator('.mode[data-mode=refs]').click();assert.equal(await page.locator('#renderMethod').inputValue(),'turbo_ref');assert.equal(await page.locator('#steps').inputValue(),'8');
 await page.locator('#modelProfile').selectOption('singularity');await page.waitForTimeout(50);assert.equal(await page.locator('#renderMethod').inputValue(),'native');
 await page.locator('#modelProfile').selectOption('original');await page.waitForTimeout(50);
 // Selecting a guided adapter first blocks generation; attaching its required visual sources clears it.
 await page.evaluate(()=>{const adapter=state.loras.find(x=>H3Configuration.isCharacterSwap(x.name));applyAdapterSelection(adapter,true);renderLoras();refreshLabControls();});
 assert.ok(await page.locator('#generate').isDisabled());
 await page.evaluate(()=>{state.refs=[{kind:'image',alias:'hero'},{kind:'video',alias:'source',localDuration:5}];updatePreviewLive();});assert.ok(await page.locator('#generate').isEnabled());
 await page.locator('#dialsPanel').evaluate(el=>el.open=true);await page.locator('#dialsPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'dials-panel.png')});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1920,height:1080});
 await page.screenshot({path:path.join(out,'selection-policy.png')});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'selection-policy.json'),JSON.stringify({dials_save_reload_graph:true,pika_defaults:true,preset_reset:true,mode_family_transition:true,atomic_restore:true,invalid_saved_settings_recoverable:true,turbo_mode_and_profile_transition:true,reference_gate_refresh:true,page_errors:errors,gpu_submissions:0},null,2));
 await browser.close();console.log('Selection transitions, restoration and availability browser checks passed.');
})().catch(async error=>{console.error(error);if(debugPage){console.error(await debugPage.evaluate(()=>({view:typeof workspaceView!=='undefined'?workspaceView:null,errors:$('error')?.textContent,issue:$('configurationIssue')?.textContent})));await debugPage.screenshot({path:path.join(out,'selection-failure.png')});}if(browser)await browser.close();process.exitCode=1;});
