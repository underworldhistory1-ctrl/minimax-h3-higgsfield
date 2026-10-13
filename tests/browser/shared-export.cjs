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
 const fixture=async route=>{
 const url=new URL(route.request().url());let data;
 if(url.pathname.startsWith('/h3_studio/lab/media/export')||url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
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
 };
 await page.route('**/*',fixture);


 await page.goto('http://127.0.0.1:18925/web/index.html');await page.waitForFunction(()=>!state.projectLoading);
 await page.evaluate(()=>{document.body.classList.remove('project-hub-open');HTMLAnchorElement.prototype.click=function(){};showVideo({file:{filename:'h3_studio_123abc456def_00001_.mp4',subfolder:'video'}});});
 const readerContext=await browser.newContext({viewport:{width:1440,height:900}}),reader=await readerContext.newPage();await reader.route('**/*',fixture);
 reader.on('pageerror',error=>errors.push(error.message));await reader.goto('http://127.0.0.1:18925/web/index.html');await reader.waitForFunction(()=>!state.projectLoading);await reader.evaluate(()=>document.body.classList.remove('project-hub-open'));
 await page.evaluate(()=>showVideo({file:{filename:'h3_studio_123abc456def_00001_.mp4',subfolder:'video'}}));
 console.log(await page.evaluate(()=>({busy:state.busy,project:state.projectLoading,exporting:state.mediaExporting,current:!!state.current,errors:document.getElementById('upscaleStatus').textContent})));
 const accepted=page.waitForResponse(response=>response.url().endsWith('/lab/media/export')&&response.request().method()==='POST');
 await page.locator('#upscaleTake').click();const response=await accepted;assert.equal(response.status(),202);const job=(await response.json()).job;
 await page.close();
 await reader.waitForFunction(id=>(state.sharedExports||[]).some(job=>job.job_id===id&&job.status==='encoding'&&job.frames_done>0),job.job_id,{timeout:90000});
 await reader.locator('#mediaExportsPanel').scrollIntoViewIfNeeded();await reader.screenshot({path:path.join(out,'shared-progress-second-device.png'),fullPage:false});
 await reader.reload();await reader.waitForFunction(()=>!state.projectLoading);await reader.evaluate(()=>document.body.classList.remove('project-hub-open'));
 await reader.waitForFunction(id=>(state.sharedExports||[]).some(job=>job.job_id===id&&job.status==='completed'),job.job_id,{timeout:120000});
 const completed=await reader.evaluate(id=>state.sharedExports.find(job=>job.job_id===id),job.job_id);
 assert.equal(completed.result.width,1728);assert.equal(completed.result.height,960);assert.equal(completed.result.frames,312);assert.equal(completed.result.verified,true);assert.ok(completed.result.sha256);
 const file=await reader.request.get('http://127.0.0.1:18925'+completed.result.download_url);assert.equal(file.status(),200);assert.ok((await file.body()).length>1000);
 await reader.locator('#mediaExportsPanel').scrollIntoViewIfNeeded();await reader.screenshot({path:path.join(out,'shared-progress-completed.png'),fullPage:false});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({submitter_closed:true,second_context_observed_actual_frames:true,refresh_survived:true,job:completed,errors,gpu_render:false},null,2));
 console.log('Real CPU upscale verified; second browser saw progress, initiator closed, reload recovered completion.');await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
