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


 let updateState={state:'idle'},applies=[];const commit='a'.repeat(40);
 await page.route('**/h3_studio/updates/*',async route=>{
  const action=new URL(route.request().url()).pathname.split('/').pop();
  if(action==='status')return route.fulfill({json:updateState});
  if(action==='check')return route.fulfill({json:{state:'available',current:'b'.repeat(40),target:commit}});
  if(action==='apply'){applies.push(route.request().postDataJSON());updateState={state:'running',target:commit};return route.fulfill({status:202,json:updateState});}
  return route.fulfill({status:404,json:{error:'Unknown fixture'}});
 });
 await page.goto('http://127.0.0.1:18925/web/index.html');
 await page.waitForFunction(()=>document.getElementById('h3UpdatesButton').textContent.includes('new'));
 await page.locator('#h3UpdatesButton').click();await page.locator('[data-check]').click();
 await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('available'));
 await page.locator('[data-apply]').click();await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Installing code'));assert.deepEqual(applies,[{commit}]);
 await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Installing code'));
 updateState={state:'restart_required',target:commit};
 await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('Restart ComfyUI manually'));
 assert.equal(await page.locator('[data-check]').isDisabled(),true);assert.equal(await page.locator('[data-apply]').isVisible(),false);
 await page.locator('[data-close]').click();
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Header fits '+width);
  const visible=await page.locator('#h3UpdatesButton').evaluate(el=>{const b=el.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===el;});assert.ok(visible,'Update action unobstructed '+width);
 }
 await page.screenshot({path:out+'/updates-header-mobile.png'});
 await page.goto('http://127.0.0.1:18925/web/image.html');await page.locator('#h3UpdatesButton').waitFor();
 assert.equal(await page.locator('#guidanceLanguage').inputValue(),'en');
 await page.locator('#h3UpdatesButton').click();assert.ok((await page.locator('[data-copy]').textContent()).includes('never start a generation'));
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: automatic update discovery, exact commit apply, progress/restart, both workspaces and responsive header. API fixture only; no update or GPU job was actually run.');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
