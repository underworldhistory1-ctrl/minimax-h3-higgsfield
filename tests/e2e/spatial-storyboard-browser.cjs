/* Actual UI/upload/project/graph routes; fixture inference is simulated. */
const {chromium}=require(process.env.H3_TEST_PLAYWRIGHT||'playwright');
const {spawn}=require('node:child_process');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const base='http://127.0.0.1:18776',server=spawn(process.env.H3_TEST_PYTHON||'python',[path.join(__dirname,'cpu_fixture.py'),'18776'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let browser,page,stderr='';server.stderr.on('data',x=>stderr+=x);
 try{
  for(let i=0;i<80;i++){try{await fetch(base+'/system_stats');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/extensions/h3_studio/index.html');await page.waitForFunction(()=>document.querySelector('#connectionText').textContent.includes('Connected')&&!state.projectLoading);
  await page.evaluate(()=>document.querySelectorAll('.workspace-stage,.workspace-fold').forEach(e=>e.open=true));
  await page.locator('[data-mode="refs"]').click();await page.locator('#preparationMode').selectOption('native');
  const image=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=200;c.getContext('2d').fillRect(0,0,320,200);return c.toDataURL('image/png').split(',')[1];}),'base64');
  const chooser=page.waitForEvent('filechooser');await page.locator('#addRef').click();await(await chooser).setFiles(['plan','board','hero'].map(name=>({name:name+'.png',mimeType:'image/png',buffer:image})));
  await page.waitForFunction(()=>state.refs.length===3);
  await page.evaluate(()=>document.querySelectorAll('#refs .compact-ref').forEach(e=>e.open=true));
  await page.locator('#refs .ref-fields select').nth(0).selectOption('spatial plan');await page.locator('#refs .ref-fields select').nth(1).selectOption('storyboard');
  await page.locator('.ref-storyboard-mode').selectOption('continuous');await page.locator('#prompt').fill('@hero follows @board. Use @plan only for geography. One continuous take.');
  const compiled=await page.evaluate(()=>H3PromptCompiler.compilePrompt(currentRenderSpec()));assert.deepEqual(compiled.bindings.map(x=>x.tag),['<Picture 1>','<Picture 2>','<Subject 1>']);assert.match(compiled.compiled_prompt,/without cuts or transitions/);
  const snapshots=await page.evaluate(()=>({draft:captureProjectDraft(true),meta:captureSettings().references}));
  assert.equal(snapshots.draft.refs[1].storyboardMode,'continuous');assert.equal(snapshots.meta[1].storyboard_mode,'continuous');
  await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.refs.every(x=>x.assetId)&&!state.projectLoading);
  await page.reload();await page.waitForFunction(()=>state.refs.length===3&&!state.projectLoading);
  assert.equal(await page.locator('.ref-storyboard-mode').inputValue(),'continuous');assert.equal(await page.locator('#refs .ref-fields select').nth(0).inputValue(),'spatial plan');
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  const captured=await(await fetch(base+'/__captured')).json(),graph=captured.at(-1).prompt;
  assert.equal(graph['6'].class_type,'MiniMaxH3ReferenceToVideo');assert.equal(Object.values(graph).filter(n=>n.class_type==='LoadImage').length,3);
  assert.equal(Object.keys(graph['6'].inputs).filter(k=>k.startsWith('ref_images.ref_image_')).length,3);assert.equal(Object.values(graph).filter(n=>n.class_type==='MiniMaxH3AddGuide').length,0);
  assert.equal(graph['6'].inputs.first_frame,undefined);assert.match(graph['6'].inputs.prompt,/spatial planning diagram/);
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.busy&&!state.running);
  await page.locator('.ref-storyboard-mode').selectOption('cuts');assert.match(await page.evaluate(()=>H3PromptCompiler.compilePrompt({...currentRenderSpec(),source_prompt:'@hero follows @board using @plan.'}).compiled_prompt),/do not invent one cut per panel/);
  await page.locator('#refs .ref-fields select').nth(1).selectOption('location');assert.equal(await page.evaluate(()=>currentRenderSpec().references[1].storyboard_mode),undefined);assert.equal(await page.evaluate(()=>H3PromptCompiler.compilePrompt(currentRenderSpec()).bindings[1].storyboard_mode),undefined);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['real spatial plan and storyboard selectors','continuous metadata in draft and saved settings','saved project reload','three native reference image inputs','no automatic AddGuide or first frame routing','separate shots mode']}));
 }catch(error){console.error(error.stack);if(page)console.error(await page.evaluate(()=>({error:document.querySelector('#error')?.textContent,refs:state.refs.map(x=>({alias:x.alias,role:x.role,mode:x.storyboardMode}))})).catch(()=>({})));console.error(stderr);process.exitCode=1;}
 finally{if(browser)await browser.close();server.kill();}
})();
