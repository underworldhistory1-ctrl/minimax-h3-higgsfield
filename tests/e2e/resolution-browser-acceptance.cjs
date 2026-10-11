// CPU-only wiring acceptance. Captured H3 graphs are never executed.
const {chromium}=require(process.env.H3_TEST_PLAYWRIGHT||'playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const base='http://127.0.0.1:18773';
 const server=spawn(process.env.H3_TEST_PYTHON||'python',[path.join(__dirname,'cpu_fixture.py'),'18773'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
 let stderr='',browser,page;server.stderr.on('data',chunk=>stderr+=chunk);
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/system_stats');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/extensions/h3_studio/index.html');
  await page.waitForFunction(()=>state.currentProject&&!state.projectLoading&&state.lorasLoaded);
  await page.locator('#preparationMode').selectOption('native');
  await page.locator('#estimates button').filter({hasText:'1664×928'}).click();
  assert.match(await page.locator('#estimates button[aria-pressed="true"]').textContent(),/1\.54 MP/);
  await page.locator('#estimates button').filter({hasText:'1920×1080'}).click();
  assert.match(await page.locator('#resolutionTip').textContent(),/1920×1088/);
  assert.equal(await page.locator('#renderMethod').inputValue(),'native');assert.equal(await page.locator('#steps').inputValue(),'20');
  const settings=await page.evaluate(()=>captureSettings());
  assert.equal(settings.canvas,'1920×1080');assert.equal(settings.sampling_canvas,'1920×1088');
  assert.deepEqual(settings.timingConfiguration.output_canvas,{width:1920,height:1080});assert.deepEqual(settings.timingConfiguration.sampling_canvas,{width:1920,height:1088});
  await page.route('**/h3_studio/readiness',async route=>{const response=await route.fetch(),ready=await response.json();ready.nodes.ImageCrop=false;await route.fulfill({response,json:ready});});
  assert.equal(await page.evaluate(()=>checkConnection()),false,'An explicitly unavailable native crop blocks1080 submission');
  assert.match(await page.locator('#connectionText').textContent(),/ImageCrop/);
  await page.unroute('**/h3_studio/readiness');assert.equal(await page.evaluate(()=>checkConnection()),true,'Older API omitting crop readiness remains compatible');
  await page.reload();await page.waitForFunction(()=>state.currentProject&&!state.projectLoading&&state.lorasLoaded);
  assert.deepEqual(await page.evaluate(()=>[state.width,state.height]),[1920,1080],'Selected output survives draft reload');
  await page.locator('#preparationMode').selectOption('native');
  await page.locator('[data-mode="frames"]').click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.getContext('2d').fillRect(0,0,320,180);return canvas.toDataURL('image/png').split(',')[1];});
  await page.locator('#firstFile').setInputFiles({name:'frame.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#durationSeconds').fill('5.2');await page.locator('#prompt').fill('A steady shot beginning at @start, quiet ambience.');
  await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.first?.assetId&&projectCtrl.currentProject?.draft?.first);
  await page.reload();await page.waitForFunction(()=>state.first?.assetId&&!state.projectLoading);
  assert.deepEqual(await page.evaluate(()=>[state.width,state.height]),[1920,1080],'Project restore retains output1080');
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  let captures=await(await fetch(base+'/__captured')).json(),graph=captures.at(-1).prompt;
  assert.equal(graph['6'].inputs.height,1088);assert.equal(graph[graph['11'].inputs.images[0]].class_type,'ImageCrop');
  const dimensions=await(await fetch(base+'/__input_info?filename='+encodeURIComponent(graph['15'].inputs.image))).json();assert.deepEqual(dimensions,{width:1920,height:1088});
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.busy);
  await page.evaluate(()=>{
   const frame=state.first;selectMode('refs');state.refs=[{...frame,kind:'image',alias:'cropped',role:'custom',imageFit:'crop'},{...frame,kind:'image',alias:'contained',role:'custom',imageFit:'contain'},{...frame,kind:'image',alias:'__proto__',role:'custom',imageFit:'preserve'}];
   renderRefs();$('prompt').value='Use @cropped and @contained with @__proto__ for appearance. Quiet ambience.';updatePreviewLive();
  });
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  captures=await(await fetch(base+'/__captured')).json();graph=captures.at(-1).prompt;
  const files=Object.values(graph).filter(node=>node.class_type==='LoadImage').map(node=>node.inputs.image);
  assert.equal(files.length,3);assert.equal(new Set(files).size,3,'Shared saved image cards preserve each prepared fit and __proto__ alias');
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.busy);
  const checks=await page.evaluate(async()=>{
   state.refs=[];selectMode('text');state.continuation={type:'generated',source_canvas:{width:1920,height:1088}};
   const generated=continuationCanvasMatches(state.continuation);state.continuation={type:'imported',source_canvas:{width:1920,height:1080}};const imported=continuationCanvasMatches(state.continuation);state.continuation=null;
   const motion={kind:'video',alias:'motion',useAudio:false},audio={kind:'audio',alias:'words'};
   const allowed=!requestsMutedSourceDialogue('Use @motion for movement. Preserve original dialogue from @words.',[motion,audio]);
   const mutedBlocked=requestsMutedSourceDialogue('Preserve original dialogue from @motion.',[motion,audio]);
   const localFit=await fitFrameImage(state.first.file,'contain'),bitmap=await createImageBitmap(localFit),localSize=[bitmap.width,bitmap.height];bitmap.close();
   state.labCapabilities.controlnet_ready=true;state.control.enabled=true;$('enableControl').checked=true;$('controlKind').value='inpaint';
   state.controlInputs={source:{file:new File(['fixture'],'source.mp4',{type:'video/mp4'}),controlDuration:6,controlWidth:320,controlHeight:180},mask:{file:state.first.file}};
   await H3ConnectedStudio.planControl();const maskAlignment=state.control.mask_alignment;
   $('enableControl').checked=false;state.control={enabled:false};state.controlInputs={};
   return {generated,imported,allowed,mutedBlocked,localSize,maskAlignment};
  });
  assert.equal(checks.generated,true);assert.equal(checks.imported,true);assert.equal(checks.allowed,true);assert.equal(checks.mutedBlocked,true);
  assert.deepEqual(checks.localSize,[1920,1088]);assert.equal(checks.maskAlignment.width,1920);assert.equal(checks.maskAlignment.height,1088);
  await fetch(base+'/__enable_continuation');await page.evaluate(()=>refreshLabCapabilities());
  await page.locator('#sourcePanel').evaluate(panel=>panel.open=true);
  await page.locator('#sourceTailSeconds').fill('2');await page.locator('#sourceMode').selectOption('text');
  const external=Buffer.from(await(await fetch(base+'/__fixtures/external-25fps.mp4')).arrayBuffer());
  await page.locator('#continuationFile').setInputFiles({name:'external.mp4',mimeType:'video/mp4',buffer:external});
  await page.waitForFunction(()=>state.continuation?.type==='imported'&&!state.projectLoading);
  assert.deepEqual(await page.evaluate(()=>state.continuation.source_canvas),{width:1920,height:1080},'Uploaded source is saved at requested1080 output');
  await page.locator('#prompt').fill('Continue with a steady camera and quiet ambience.');
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  captures=await(await fetch(base+'/__captured')).json();graph=captures.at(-1).prompt;
  const finalCrop=graph[graph['11'].inputs.images[0]];assert.equal(finalCrop.class_type,'ImageCrop');assert.equal(graph[finalCrop.inputs.image[0]].class_type,'H3LabTrimAV');
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.busy);
  await page.evaluate(()=>{state.continuation={...state.continuation,type:'generated',source_model:modelFL,source_token:'abcdef123456',source_canvas:{width:1920,height:1088}};});
  await page.evaluate(()=>useContinuationReferences());
  assert.equal(await page.evaluate(()=>state.continuation.type),'imported');assert.equal(await page.evaluate(()=>state.mode),'refs');
  assert.deepEqual(await page.evaluate(()=>state.continuation.source_canvas),{width:1920,height:1080},'FL generated1088 to Ref2VA re-encode uses imported1080 source metadata');
  assert.deepEqual(errors,[]);
  if(process.env.H3_TEST_SCREENSHOT)await page.screenshot({path:process.env.H3_TEST_SCREENSHOT,fullPage:true});
  console.log(JSON.stringify({passed:true,checks:['1.54/2.07MP preset labels and unchanged20step native quality','output1080/sampling1088 settings and timing','draft and saved project restore','actual savedframe fitting1088 and final crop','shared asset cards retain different fits and __proto__ alias','generated/imported continuation canvas prechecks','separate audio plus muted motion dialogue guard','local image fit and inpaint mask sampling-grid alignment','actual source upload preserves1080 with crop after AV trim','FL1088 to Ref2VA re-encode uses imported1080 metadata'],captured_graphs:captures.length,errors},null,2));
 }catch(error){console.error(error.stack);if(page)console.error(await page.evaluate(()=>({error:$('error').textContent,mode:state.mode,busy:state.busy,loading:state.projectLoading})).catch(()=>({})));console.error(stderr);process.exitCode=1;}
 finally{if(browser)await browser.close();server.kill();}
})();
