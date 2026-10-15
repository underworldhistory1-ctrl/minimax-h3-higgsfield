/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(/\.(js|css)(\?|$)/.test(response.url())&&response.status()>=400)errors.push('Asset HTTP '+response.status()+': '+response.url());});
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
 await page.locator('#newProjectName').fill('Usability regression');await page.locator('#projectHubCreate').click();
 await page.waitForFunction(()=>state.currentProject?.name==='Usability regression'&&!state.projectLoading);
 await page.evaluate(()=>setWorkspaceView('studio'));
 const order=await page.evaluate(()=>[...document.querySelector('.sidebar-scroll').children].map(el=>el.id||el.querySelector('h2,summary')?.textContent||''));
 assert.ok(order.indexOf('projectPanel')<order.indexOf('shotInputsHeading'),'Project comes before shot inputs');
 assert.ok(order.indexOf('Prompt')<order.indexOf('modelConfiguration'),'Prompt comes before advanced model configuration');
 assert.ok(order.indexOf('renderSetupHeading')<order.indexOf('modelConfiguration'));
 assert.ok(order.indexOf('optionalGuidanceHeading')<order.indexOf('sourcePanel'));
 await page.locator('#prompt').fill('A steady scene. Preserve this prompt.');
 assert.equal(await page.locator('#guidanceLanguage').inputValue(),'en');
 assert.equal(await page.locator('[data-guidance-key=model]').getAttribute('lang'),'en');
 await page.locator('#guidanceLanguage').selectOption('ar');
 assert.equal(await page.locator('[data-guidance-key=model]').getAttribute('dir'),'rtl');
 assert.equal(await page.locator('#prompt').inputValue(),'A steady scene. Preserve this prompt.');
 await page.reload();await page.waitForFunction(()=>projectCtrl&&!state.projectLoading);await page.evaluate(()=>setWorkspaceView('studio'));
 assert.equal(await page.locator('#guidanceLanguage').inputValue(),'ar');await page.locator('#guidanceLanguage').selectOption('en');
 for(const width of [1920,1440,1024,768,720,390]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>document.querySelectorAll('.sidebar-scroll details').forEach(el=>el.open=true));
   for(const mode of ['text','frames','refs']){
     await page.locator('[data-mode='+mode+']').click();
     const geometry=await page.evaluate(()=>{
       const rail=document.querySelector('.left').getBoundingClientRect();
       const bad=[...document.querySelectorAll('.sidebar-scroll input:not([type=hidden]):not([type=file]),.sidebar-scroll select,.sidebar-scroll textarea,.sidebar-scroll button')].filter(el=>{const b=el.getBoundingClientRect();return b.width&&b.height&&(b.left<rail.left-1||b.right>rail.right+1);}).map(el=>el.id||el.textContent.slice(0,40));
       return {bad,doc:document.documentElement.scrollWidth,viewport:innerWidth};
     });
     assert.deepEqual(geometry.bad,[],width+'px '+mode+' clipped controls');assert.ok(geometry.doc<=width+1,width+'px horizontal overflow');
   }
   const target=page.locator('#generate');await target.scrollIntoViewIfNeeded();
   const hit=await target.evaluate(el=>{const b=el.getBoundingClientRect();const top=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return top===el||el.contains(top);});assert.ok(hit,width+'px Generate is unobstructed');
   await page.screenshot({path:out+'/layout-'+width+'.png'});
 }
 for(const view of ['projects','elements','generations','favorites','activity']){
   await page.evaluate(view=>setWorkspaceView(view),view);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' has no horizontal overflow');
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: option hierarchy, bilingual persistence, six widths, three modes, five workspaces and Generate hit testing. No GPU submitted.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
