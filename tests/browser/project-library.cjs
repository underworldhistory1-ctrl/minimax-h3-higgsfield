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
 const url=new URL(route.request().url());let data;if(url.pathname==='/h3_studio/lab/jobs'&&route.request().method()==='POST'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{error:'Captured setup; no GPU submission.'}});}
 if(url.pathname.startsWith('/h3_studio/lab/organization')||url.pathname.startsWith('/h3_studio/lab/videos/reuse')||url.pathname.startsWith('/h3_studio/lab/projects')||url.pathname.startsWith('/h3_studio/lab/assets')||url.pathname.startsWith('/h3_studio/lab/media/exports'))return route.continue();
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


 await page.goto('http://127.0.0.1:18925/web/index.html');await page.waitForFunction(()=>projectCtrl&&!state.projectLoading);await page.locator('[data-workspace-nav=projects]').click();

 const stamp=Date.now();
 const ids=[];for(const name of ['Northern Lights','The Last Train','Quiet City']){const project=await (await page.request.post('http://127.0.0.1:18925/h3_studio/lab/projects',{data:{name:name+' '+stamp}})).json();ids.push(project.project_id);}
 await page.reload();await page.waitForFunction(()=>projectCtrl&&!state.projectLoading);await page.waitForFunction(()=>document.querySelectorAll('.project-card').length>=3);
 await page.locator('#projectSearch').fill(String(stamp));await page.waitForFunction(()=>document.querySelectorAll('.project-card').length===3);
 assert.equal(await page.locator('#projectHubList').getAttribute('data-view'),'grid');assert.equal(await page.locator('[data-project-view=grid]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.project-card .project-card-preview').count(),3);assert.equal(await page.locator('.project-card .project-card-actions > *').count(),12);
 const width=await page.locator('.project-card').first().evaluate(e=>e.getBoundingClientRect().width);assert.ok(width<500,'bounded card density');
 await page.screenshot({path:path.join(out,'project-library-grid.png')});
 await page.getByRole('button',{name:'List view',exact:true}).click();assert.equal(await page.locator('#projectHubList').getAttribute('data-view'),'list');await page.screenshot({path:path.join(out,'project-library-list.png')});
 await page.reload();await page.waitForFunction(()=>projectCtrl&&!state.projectLoading);await page.waitForFunction(()=>document.querySelectorAll('.project-card').length>=3);assert.equal(await page.locator('#projectHubList').getAttribute('data-view'),'list');
 await page.locator('#projectSearch').fill('absent-project-'+stamp);await page.waitForFunction(()=>document.querySelectorAll('.project-card').length===0);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.project-card').length>=3);
 await page.getByRole('button',{name:'Grid view',exact:true}).click();await page.locator('#projectSearch').fill(String(stamp));
 for(const width of [390,768]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(out,'project-library-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page fits '+width);}
 await page.setViewportSize({width:1440,height:1000});const first=page.locator('.project-card').filter({has:page.getByRole('heading',{name:'Northern Lights '+stamp,exact:true})});await first.getByRole('button',{name:'Rename',exact:true}).click();await page.locator('#workspaceNameInput').fill('Renamed production '+stamp);await page.getByRole('button',{name:'Save name',exact:true}).click();await page.waitForFunction(name=>[...document.querySelectorAll('.project-card h2')].some(e=>e.textContent===name),'Renamed production '+stamp);
 assert.deepEqual(errors,[]);await browser.close();console.log('Project grid/list, persisted layout, search/clear, rename dialog and 390/768 layout passed; fixture APIs, no inference.');
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
