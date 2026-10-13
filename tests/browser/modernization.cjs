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
 assert.ok((await page.locator('#serverAttention').innerText()).includes('PyTorch dense'));
 assert.equal(await page.evaluate(()=>captureSettings().server_attention.implementation),'attention_pytorch');
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
 // Exports use saved media without generation or settings changes.
 await page.evaluate(()=>{
   window.__originalFetch=window.fetch;window.__originalAnchorClick=HTMLAnchorElement.prototype.click;
   window.__downloads=[];HTMLAnchorElement.prototype.click=function(){window.__downloads.push(this.href);};
   window.fetch=(url,options)=>String(url).includes('/lab/media/export')?new Promise(resolve=>{window.__export={resolve,body:JSON.parse(options.body)};}):window.__originalFetch(url,options);
   window.__settingsBefore=JSON.stringify(captureSettings());
   showVideo({file:{filename:'h3_studio_abcdef123456_00001_.mp4',subfolder:'video'}});
 });
 await page.locator('#upscaleTake').click();await page.waitForFunction(()=>window.__export);
 assert.equal(await page.evaluate(()=>window.__export.body.target),'2x');
 assert.equal(await page.evaluate(()=>window.__export.body.output_file),'video/h3_studio_abcdef123456_00001_.mp4');
 await page.evaluate(()=>{setBusy(false);window.__projectTask=withProjectLoading(()=>new Promise(resolve=>window.__projectRelease=resolve));});
 assert.equal(await page.locator('#upscaleTake').isDisabled(),true);
 await page.evaluate(()=>window.__export.resolve(new Response(JSON.stringify({download_url:'/h3_studio/lab/exports/test.mp4',filename:'test.mp4',width:1728,height:960,frames:311}),{status:201})));
 await page.waitForFunction(()=>!state.mediaExporting);assert.equal(await page.locator('#upscaleTake').isDisabled(),true);
 await page.evaluate(()=>window.__projectRelease());await page.waitForFunction(()=>!state.projectLoading);
 assert.equal(await page.locator('#upscaleTake').isDisabled(),false);
 assert.ok((await page.locator('#upscaleStatus').innerText()).includes('1728×960'));
 await page.screenshot({path:path.join(out,'same-take-upscale.png'),fullPage:false});
 await page.evaluate(()=>{window.__export=null;});await page.locator('#upscaleTake').click();await page.waitForFunction(()=>window.__export);
 await page.evaluate(()=>{
   localStorage.setItem(baseKey,'https://new-server.invalid');
   showVideo({file:{filename:'h3_studio_fedcba654321_00001_.mp4',subfolder:'video'}});
   window.__export.resolve(new Response(JSON.stringify({download_url:'/h3_studio/lab/exports/second.mp4',filename:'second.mp4',width:1728,height:960,frames:311}),{status:201}));
 });
 await page.waitForFunction(()=>!state.mediaExporting);
 assert.equal(await page.locator('#upscaleStatus').innerText(),'');
 assert.ok(!(await page.evaluate(()=>window.__downloads.at(-1))).includes('new-server.invalid'));
 await page.evaluate(()=>{localStorage.removeItem(baseKey);window.fetch=window.__originalFetch;HTMLAnchorElement.prototype.click=window.__originalAnchorClick;});
 assert.equal(await page.evaluate(()=>JSON.stringify(captureSettings())===window.__settingsBefore),true);
 // Every saved card exposes its own actions without changing generation settings.
 await page.evaluate(()=>{
   window.__libraryFetch=fetch;window.__libraryCalls=[];
   window.__libraryA={file:{filename:'h3_studio_aabbcc112233_00001_.mp4',subfolder:'video'},kept:true};
   window.__libraryB={file:{filename:'h3_studio_ddeeff112233_00001_.mp4',subfolder:'video'},kept:false};
   state.results=[window.__libraryA,window.__libraryB];showVideo(window.__libraryB);renderResults();
   window.confirm=()=>true;
   window.fetch=(url,options)=>{
     if(String(url).includes('/delete_video')){window.__libraryCalls.push(JSON.parse(options.body));return new Promise(resolve=>window.__deleteResolve=resolve);}
     return window.__libraryFetch(url,options);
   };
 });
 assert.equal(await page.locator('.result-actions').count(),2);
 assert.equal(await page.locator('.result').first().evaluate(card=>{const label=card.querySelector('.result-label').getBoundingClientRect(),actions=card.querySelector('.result-actions').getBoundingClientRect(),bounds=card.getBoundingClientRect();return label.top>=bounds.top&&label.bottom<=actions.top+1&&label.height>=35;}),true);
 assert.equal(await page.locator('#discard').isVisible(),true);
 await page.locator('.result-actions').first().getByRole('button',{name:'Options'}).click();
 assert.equal(await page.locator('#videoActionsDialog').isVisible(),true);
 assert.ok((await page.locator('#videoActionsName').innerText()).includes('aabbcc112233'));
 await page.locator('#videoActionsClose').click();
 // Pinned card deletion is explicit and does not clear another video's player.
 await page.locator('.result-actions').first().getByRole('button',{name:'Delete'}).click();
 await page.waitForFunction(()=>window.__deleteResolve);
 assert.equal(await page.locator('.result-actions').first().getByRole('button',{name:'Delete'}).isDisabled(),true);
 await page.evaluate(()=>window.__deleteResolve(new Response(JSON.stringify({ok:true}),{status:200})));
 await page.waitForFunction(()=>state.results.length===1);
 assert.equal(await page.evaluate(()=>state.current.file.filename), 'h3_studio_ddeeff112233_00001_.mp4');
 // Failed deletion retains the card and shows the server's reason.
 await page.evaluate(()=>window.__deleteResolve=null);
 await page.locator('.result-actions').first().getByRole('button',{name:'Options'}).click();
 await page.locator('#videoActionsDelete').click();await page.waitForFunction(()=>window.__deleteResolve);
 await page.evaluate(()=>window.__deleteResolve(new Response(JSON.stringify({error:'Video is in use'}),{status:409})));
 await page.waitForFunction(()=>$('videoActionsStatus').textContent.includes('in use'));
 assert.equal(await page.locator('.result').count(),1);
 // The card's export uses that card even when another preview is selected.
 await page.evaluate(()=>{
   state.current=window.__libraryA;window.__cardBefore=JSON.stringify(captureSettings());window.__cardExport=null;
   window.fetch=(url,options)=>String(url).includes('/lab/media/export')?new Promise(resolve=>window.__cardExport={resolve,body:JSON.parse(options.body)}):window.__libraryFetch(url,options);
   window.__cardAnchor=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){};
 });
 await page.locator('#videoActionsTarget').selectOption('1080');await page.locator('#videoActionsUpscale').click();await page.waitForFunction(()=>window.__cardExport);
 assert.equal(await page.evaluate(()=>window.__cardExport.body.filename),'h3_studio_ddeeff112233_00001_.mp4');
 assert.equal(await page.evaluate(()=>window.__cardExport.body.target),'1080');
 assert.equal(await page.locator('#videoActionsDelete').isDisabled(),true);
 assert.equal(await page.locator('#wipe').isDisabled(),true);
 await page.evaluate(()=>window.__cardExport.resolve(new Response(JSON.stringify({download_url:'/h3_studio/lab/exports/card.mp4',filename:'card.mp4',width:1944,height:1080,frames:311}),{status:201})));
 await page.waitForFunction(()=>!state.mediaExporting&&$('videoActionsStatus').textContent.includes('1944×1080'));
 assert.equal(await page.evaluate(()=>JSON.stringify(captureSettings())===window.__cardBefore),true);
 await page.screenshot({path:path.join(out,'video-options.png')});
 await page.locator('#videoActionsClose').click();
 // A late old-server delete response must never remove a new server's same-named entry.
 await page.evaluate(()=>{window.fetch=(url,options)=>String(url).includes('/delete_video')?new Promise(resolve=>window.__lateDelete=resolve):window.__libraryFetch(url,options);});
 await page.locator('.result-actions').first().getByRole('button',{name:'Delete'}).click();await page.waitForFunction(()=>window.__lateDelete);
 await page.evaluate(()=>{localStorage.setItem(baseKey,'https://new-server.invalid');state.results=[{...window.__libraryB}];renderResults();window.__lateDelete(new Response(JSON.stringify({ok:true}),{status:200}));});
 await page.waitForFunction(()=>videoDeletions.size===0);assert.equal(await page.locator('.result').count(),1);
 await page.evaluate(()=>{localStorage.removeItem(baseKey);window.fetch=window.__libraryFetch;HTMLAnchorElement.prototype.click=window.__cardAnchor;renderResults();});
 await page.screenshot({path:path.join(out,'library-actions.png')});
 // Bulk unpinned deletion keeps server-side pin protection and locks source exports.
 await page.evaluate(()=>{
   window.__bulkPending=[];state.results=[window.__libraryB];showVideo(window.__libraryB);renderResults();
   window.fetch=(url,options)=>String(url).includes('/h3_studio/discard')?new Promise(resolve=>window.__bulkPending.push({resolve,url:String(url)})):window.__libraryFetch(url,options);
 });
 await page.locator('#wipe').click();await page.waitForFunction(()=>window.__bulkPending.length===1);
 await page.locator('.result-actions').first().getByRole('button',{name:'Options'}).click();assert.equal(await page.locator('#videoActionsUpscale').isDisabled(),true);
 await page.evaluate(()=>window.__bulkPending[0].resolve(new Response(JSON.stringify({ok:true,skipped:'saved'}),{status:200})));
 await page.waitForFunction(()=>videoDeletions.size===0);assert.equal(await page.locator('.result').count(),1);
 await page.locator('#videoActionsClose').click();
 await page.evaluate(()=>window.__bulkPending=[]);await page.locator('#wipe').click();await page.waitForFunction(()=>window.__bulkPending.length===1);
 await page.evaluate(()=>{localStorage.setItem(baseKey,'https://new-server.invalid');state.results=[{...window.__libraryB}];showVideo(state.results[0]);renderResults();window.__bulkPending[0].resolve(new Response(JSON.stringify({ok:true}),{status:200}));});
 await page.waitForFunction(()=>videoDeletions.size===0);assert.equal(await page.locator('.result').count(),1);assert.equal(await page.locator('#resultCard').isVisible(),true);
 await page.evaluate(()=>{localStorage.removeItem(baseKey);window.fetch=window.__libraryFetch;renderResults();});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:false});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({status:'passed',checks:['740px desktop sidebar','keyboard resize persistence','multi-image upload','compact expandable references','rename and reorder bindings','Singularity loader and sampler overrides','refresh persistence','mobile overflow','Character Swap guided preset, native tags and stable IDs','server dense backend visible and saved','same-take export keeps settings','export lifecycle and source-server/result races','per-video options and pinned deletion','failed deletion retains card','bulk pin and source-server guards','card-specific upscale and server-switch protection','zero uncaught errors'],gpu_rendered:false,fixture_backend:true},null,2));await browser.close();console.log('Browser contracts passed; no GPU inference was performed.');
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
