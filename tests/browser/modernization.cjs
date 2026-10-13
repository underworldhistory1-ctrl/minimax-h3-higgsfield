/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;
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
 await page.goto(process.env.H3_TEST_URL||'http://127.0.0.1:18923/web/index.html');await page.waitForFunction(()=>window.H3ConfigurationUI&&document.getElementById('modelProfile').options.length===4);
 await page.waitForFunction(()=>!document.querySelector('[data-mode="refs"]').disabled);
 assert.equal(await page.locator('.left').evaluate(e=>Math.round(e.getBoundingClientRect().width)),740);
 await page.locator('[data-mode="refs"]').click();await page.evaluate(()=>state.pendingRefKind='image');
 const image=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
 await page.locator('#refFile').setInputFiles(['hero','room','style'].map(name=>({name:name+'.jpg',mimeType:'image/jpeg',buffer:image})));
 assert.equal(await page.locator('#refs .compact-ref').count(),3);assert.equal(await page.locator('#refs details[open]').count(),0);
 await page.locator('#refs summary').first().click();await page.locator('#refs input[aria-label="Reference name"]').first().fill('lead');await page.locator('#refs input[aria-label="Reference name"]').first().dispatchEvent('change');
 await page.locator('#prompt').fill('Film @lead in the setting of @room with @style.');await page.locator('#refs summary').first().getByRole('button',{name:'↓',exact:true}).click();
 const mapping=await page.evaluate(()=>{const spec=currentRenderSpec();const result=H3PromptCompiler.compilePrompt(spec);const assets=Object.fromEntries(spec.references.map(r=>[r.alias,r.alias+'.png']));const graph=H3GraphBuilder.buildGraph({...spec,compiled_prompt:result.compiled_prompt},assets,state.labCapabilities);return{refs:spec.references.map(r=>r.alias),compiled:result.compiled_prompt,images:Object.entries(graph['6'].inputs).filter(([k])=>k.startsWith('ref_images')).map(([,v])=>graph[v[0]].inputs.image)};});
 assert.deepEqual(mapping.refs,['room','lead','style']);assert.deepEqual(mapping.images,['room.png','lead.png','style.png']);assert.ok(mapping.compiled.includes('<Picture 2>'));
 await page.screenshot({path:path.join(out,'references-desktop.png'),fullPage:false});
 await page.locator('#modelProfile').selectOption('singularity');await page.waitForFunction(()=>state.modelProfile==='singularity'&&state.checkpoint);
 await page.locator('#samplingControls > summary').click();await page.locator('[data-setting="sampler_name"]').selectOption('euler');await page.locator('[data-setting="shift_video"]').fill('9');await page.locator('[data-setting="shift_video"]').dispatchEvent('change');
 const sampler=await page.evaluate(()=>{const spec=currentRenderSpec();const graph=H3GraphBuilder.buildGraph(spec,Object.fromEntries(spec.references.map(r=>[r.alias,r.alias+'.png'])),state.labCapabilities);return{model:graph['1'].inputs.unet_name,sampler:graph['8'].inputs.sampler_name,shift:graph['2'].inputs.shift_video};});assert.deepEqual(sampler,{model:singular,sampler:'euler',shift:9});
 await page.screenshot({path:path.join(out,'singularity-settings.png'),fullPage:false});
 await page.reload();await page.waitForFunction(()=>window.H3ConfigurationUI&&state.sampling?.shift_video===9);assert.equal(await page.locator('#modelProfile').inputValue(),'singularity');assert.equal(await page.locator('[data-setting="sampler_name"]').inputValue(),'euler');
 await page.locator('.sidebar-resizer').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('.left').evaluate(e=>Math.round(e.getBoundingClientRect().width)),720);
 await page.evaluate(async()=>{await hydrateProjectDraft({mode:'text',settings:{renderMethod:'turbo',steps:6}});});assert.equal(await page.locator('#renderMethod').inputValue(),'native');assert.equal(await page.locator('#steps').inputValue(),'20');
 const refine=await page.evaluate(()=>{state.refinement={steps:80,denoise:.25,sampler_name:'euler',scheduler:'normal',cfg:2};state.refineScale=1;$('enableRefine').checked=true;return refinementSettings();});assert.deepEqual(refine,{scale:1,steps:80,denoise:.25,cfg:2,sampler_name:'euler',scheduler:'normal'});

 await page.evaluate(()=>{state.continuation=null;state.refs=[{kind:'image',alias:'replacement',role:'custom',file:new File(['image'],'replacement.png',{type:'image/png'}),url:'',assetId:'replacement-id'},{kind:'video',alias:'source',role:'custom',file:new File(['video'],'source.mp4',{type:'video/mp4'}),url:'',assetId:'source-id',meta:{fps:24,frame_count:124,duration:124/24}}];renderRefs();});
 await page.locator('#prepareSwap').evaluate(e=>e.closest('details').open=true);await page.locator('#swapTarget').fill('the person in the red jacket');await page.locator('#prepareSwap').click();
 const swap=await page.evaluate(()=>{const spec=currentRenderSpec(),compiled=H3PromptCompiler.compilePrompt(spec).compiled_prompt,graph=H3GraphBuilder.buildGraph({...spec,compiled_prompt:compiled},{source:'s.mp4',replacement:'r.png'},state.labCapabilities);return {profile:state.modelProfile,method:method(),compiled,refs:spec.references.map(r=>[r.asset_id,r.alias]),checkpoint:graph['1'].inputs.unet_name,adapter:Object.values(graph).find(n=>n.class_type==='LoraLoaderModelOnly').inputs};});
 assert.equal(swap.profile,'original');assert.equal(swap.method,'native');assert.equal(swap.checkpoint,'minimax_h3_ref2va_pruned_int8_convrot.safetensors');assert.equal(swap.adapter.strength_model,1);assert.ok(swap.compiled.includes('<Picture 1>'));assert.ok(swap.compiled.includes('<Video 1>'));assert.deepEqual(swap.refs,[['replacement-id','replacement'],['source-id','source']]);
 await page.screenshot({path:path.join(out,'character-swap.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({status:'passed',checks:['740px desktop sidebar','keyboard resize persistence','multi-image upload','compact expandable references','rename and reorder bindings','Singularity loader and sampler overrides','refresh persistence','mobile overflow','Character Swap guided preset, native tags and stable IDs','zero uncaught errors'],gpu_rendered:false,fixture_backend:true},null,2));await browser.close();console.log('Browser contracts passed; no GPU inference was performed.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
