/* Run against a locally served checkout. Fixtures test UI contracts, never GPU readiness. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.H3_TEST_OUTPUT||path.join(root,'../browser-evidence'));
const C=require('../../web/h3/configuration');
const schemas={KSampler:{input:{required:{sampler_name:[['res_multistep','euler']],scheduler:[['simple','normal']]}}},UNETLoader:{input:{required:{weight_dtype:[['default','fp8_e4m3fn']]}}},MiniMaxH3SigmaShift:{input:{required:{shift_video:['FLOAT',{default:12,min:0,max:100}],shift_audio:['FLOAT',{default:3,min:0,max:100}]}}},MiniMaxH3MotionCache:{input:{required:{model:['MODEL'],reuse_threshold:['FLOAT',{default:.15,min:0,max:1}],warmup_steps:['INT',{default:4,min:0,max:100}]}}},SpectrumApplyMiniMaxH3:{input:{required:{model:['MODEL'],blend_weight:['FLOAT',{default:.5,min:0,max:1}]}}}};
const singular='Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors';
const caps={server_attention:{implementation:"attention_pytorch",label:"PyTorch dense",quantized:false,scope:"server_dense_default",checkpoint_overrides_possible:true},model_catalog:[{name:singular,profiles:['singularity'],loader:'UNETLoader'},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader'],loader:'UNETLoader'}],hybrid_loader_ready:true,controlnet_ready:true,controlnet_references_ready:true,refine_ready:true,continuation_ready:true,add_guide:true,inference_enabled:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple','normal'],weight_dtypes:['default','fp8_e4m3fn']},control_preprocessors:{}};
let browser,animeInstalled=true;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const url=new URL(route.request().url());let data;
 if(url.pathname.startsWith('/object_info/')){const name=url.pathname.split('/').pop();data={[name]:schemas[name]||{input:{required:{}}}};}
 else if(url.pathname==='/system_stats')data={devices:[{name:'UI fixture · no inference'}]};
 else if(url.pathname==='/h3_studio/readiness')data={models:{fl2va:true,ref2va:true,text_encoder:true,video_vae:true,audio_vae:true},nodes:Object.fromEntries(['UNETLoader','MiniMaxH3SigmaShift','CLIPLoader','VAELoader','MiniMaxH3ImageToVideo','MiniMaxH3ReferenceToVideo','ConditioningZeroOut','KSampler','VAEDecode','VAEDecodeAudio','CreateVideo','H3SaveVideo','H3ReleaseForDecode','H3LoadSavedLatent','SaveVideo','LoadImage','LoadVideo','GetVideoComponents','LoadAudio','LoraLoaderModelOnly','SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache','ImageCrop','ImageScale','ImageFromBatch','TrimAudioDuration'].map(x=>[x,true])),quality:{h3_vae_tile_fix:true}};
 else if(url.pathname==='/h3_studio/lab/capabilities')data=caps;
 else if(url.pathname==='/h3_studio/lab/prompt/status')data={configured:false,reason:'Browser fixture: prompt AI not connected.'};
 else if(url.pathname==='/h3_studio/loras')data={items:[...(animeInstalled?[C.ANIME_TO_REALISM]:[]),'h3_character_swap_pro4500_1000.safetensors']};
 else if(url.pathname==='/queue')data={queue_running:[],queue_pending:[]};
 else if(url.pathname==='/history')data={};
 else if(url.pathname.startsWith('/h3_studio/'))data=url.pathname.includes('library')?{videos:[]}:url.pathname.includes('projects')?{projects:[]}:{samples:[],contexts:[]};
 if(data!==undefined)return route.fulfill({json:data});return route.continue();
 });
 await page.goto(process.env.H3_TEST_URL||'http://127.0.0.1:18923/web/index.html');await page.waitForFunction(()=>window.H3ConfigurationUI&&document.getElementById('modelProfile').options.length===4);
 await page.evaluate(()=>setWorkspaceView('studio'));
 await page.waitForFunction(()=>!document.querySelector('[data-mode="refs"]').disabled);
 assert.ok((await page.locator('#serverAttention').innerText()).includes('PyTorch dense'));
 await page.evaluate(()=>{state.continuation=null;state.refs=[{kind:'image',alias:'replacement',role:'custom',file:new File(['image'],'replacement.png',{type:'image/png'}),url:'',assetId:'replacement-id'},{kind:'video',alias:'source',role:'custom',file:new File(['video'],'source.mp4',{type:'video/mp4'}),url:'',assetId:'source-id',meta:{fps:24,frame_count:124,duration:124/24}}];renderRefs();});
 await page.evaluate(()=>{state.sampling={sampler_name:'euler',shift_video:9};});
 await page.locator('#applyStyle').evaluate(e=>e.closest('details').open=true);
 await page.locator('#styleDirection').selectOption('anime_to_realism');await page.locator('#applyStyle').click();
 const restyle=await page.evaluate(()=>{const spec=currentRenderSpec(),compiled=H3PromptCompiler.compilePrompt(spec).compiled_prompt,graph=H3GraphBuilder.buildGraph({...spec,compiled_prompt:compiled},{source:'s.mp4',replacement:'r.png'},state.labCapabilities);return{profile:state.modelProfile,method:method(),prompt:$('prompt').value,loras:spec.loras,model:graph['1'].inputs.unet_name,sampler:graph['8'].inputs.sampler_name,shift:graph['2'].inputs.shift_video,ids:state.refs.map(r=>r.assetId)};});
 assert.equal(restyle.profile,'original');assert.equal(restyle.model,C.REF);assert.equal(restyle.method,'native');assert.ok(restyle.prompt.includes('LumiReal'));assert.equal(restyle.loras.length,1);assert.equal(restyle.loras[0].name,C.ANIME_TO_REALISM);assert.equal(restyle.sampler,'euler');assert.equal(restyle.shift,9);assert.deepEqual(restyle.ids,['replacement-id','source-id']);
 assert.ok((await page.locator('#styleAdapterNotice').innerText()).includes('installed'));
 await page.screenshot({path:path.join(out,'anime-realism-prepared.png'),fullPage:false});
 await page.locator('#styleDirection').selectOption('realism_to_anime');await page.locator('#applyStyle').click();assert.equal(await page.evaluate(()=>state.loras.some(l=>l.enabled&&H3Configuration.isAnimeToRealism(l.name))),false);assert.ok(!(await page.locator('#prompt').inputValue()).includes('LumiReal'));
 animeInstalled=false;await page.evaluate(async()=>{await loadLoras();});
 await page.locator('#styleDirection').selectOption('anime_to_realism');const previousPrompt=await page.locator('#prompt').inputValue();await page.locator('#applyStyle').click();assert.equal(await page.locator('#prompt').inputValue(),previousPrompt);assert.ok((await page.locator('#error').innerText()).includes('missing'));
 animeInstalled=true;await page.evaluate(async()=>{await loadLoras();});
 assert.deepEqual(errors,[]);await browser.close();console.log('Anime → Realism browser contracts passed; no GPU inference.');
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1);});
