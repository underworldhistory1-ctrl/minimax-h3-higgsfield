/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser;const submissions=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;
 if(url.pathname==='/h3_studio/lab/jobs'&&route.request().method()==='POST'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Captured for browser verification; no GPU submission.'}});}
 if(url.pathname==='/h3_studio/upload_ref')return route.fulfill({json:{name:'h3_studio_kf_fixture.png',width:640,height:480}});
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


 await page.addInitScript(()=>localStorage.setItem('h3studio.draft.v3',JSON.stringify({seed:'1.25',duration:'73',durationRequested:'3',mode:'text',prompts:{text:'A quiet room.'}})));
 await page.goto('http://127.0.0.1:18925/web/index.html');await page.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.modelsReady&&state.nodesReady);
 assert.equal(await page.locator('#seed').inputValue(),'42');assert.equal(await page.locator('#duration').inputValue(),'73');
 await page.locator('#newProjectName').fill('Seed and short-duration verification');await page.locator('#projectHubCreate').click();await page.waitForFunction(()=>!state.projectLoading&&workspaceView==='studio');
 await page.evaluate(()=>hydrateProjectDraft({mode:'text',settings:{seed:1.25,durationSeconds:'3',duration:'73'},prompts:{text:'A quiet room.'}}));assert.equal(await page.locator('#seed').inputValue(),'42');
 const image=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
 await page.locator('[data-mode=frames]').click();await page.locator('#firstFile').setInputFiles({name:'first.jpg',mimeType:'image/jpeg',buffer:image});
 await page.locator('[data-mode=refs]').click();await page.evaluate(()=>state.pendingRefKind='image');await page.locator('#refFile').setInputFiles({name:'hero.jpg',mimeType:'image/jpeg',buffer:image});
 for(const mode of ['text','frames','refs']){
   await page.locator('[data-mode='+mode+']').click();await page.locator('#prompt').fill(mode==='refs'?'A quiet portrait of @hero.':'A quiet room.');
   await page.locator('#durationSeconds').fill('3');await page.locator('#durationSeconds').dispatchEvent('input');await page.evaluate(()=>{$('seed').value='42';});
   const before=submissions.length;await page.locator('#generate').click();await page.waitForTimeout(800);await page.waitForFunction(()=>!state.busy);assert.equal(submissions.length,before+1,await page.locator('#error').textContent());
   const spec=submissions.at(-1).render_spec;assert.equal(spec.workflow['6'].inputs.length,73);assert.equal(spec.workflow['8'].inputs.seed,42);
 }
 await page.evaluate(()=>{$('seed').value='18446744073709551615';$('enableRefine').checked=true;});
 await page.locator('#generate').click();await page.waitForTimeout(800);await page.waitForFunction(()=>!state.busy);const spec=submissions.at(-1).render_spec;assert.equal(spec.workflow['8'].inputs.seed,'18446744073709551615');const samplers=Object.values(spec.workflow).filter(n=>n.class_type==='KSampler');assert.equal(samplers[1].inputs.seed,0);
 await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.currentProject.draft?.settings.seed==='18446744073709551615');await page.reload();await page.waitForFunction(()=>projectCtrl&&!state.projectLoading&&state.currentProject);assert.equal(await page.locator('#seed').inputValue(),'18446744073709551615');
 await page.evaluate(()=>{$('seed').value='-1';$('enableRefine').checked=false;});await page.locator('#generate').click();await page.waitForTimeout(800);await page.waitForFunction(()=>!state.busy);assert.ok(Number.isSafeInteger(submissions.at(-1).render_spec.workflow['8'].inputs.seed));
 await page.locator('#durationSeconds').fill('0.2');await page.locator('#durationSeconds').dispatchEvent('input');assert.equal(await page.locator('#duration').inputValue(),'5');assert.ok((await page.locator('#durationHint').textContent()).includes('outside'));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'seed-duration-verification.json'),JSON.stringify({fractional_local_draft_repaired:true,fractional_project_seed_repaired:true,default_seed:42,submitted_modes:['text','frames','refs'],duration_frames:73,uint64_exact:true,refinement_seed_wrap:true,random_resolved_before_submission:true,minimum_native_frames:5,submissions_captured:submissions.length,gpu_submissions:0,errors},null,2));
 await page.locator('#advancedSampling').evaluate(el=>el.open=true).catch(()=>{});await page.screenshot({path:path.join(out,'seed-duration.png'),fullPage:true});
 await browser.close();console.log('Actual Generate flow captured for all3 modes; no GPU submission.');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
