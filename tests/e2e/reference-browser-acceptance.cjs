const {chromium}=require(process.env.H3_TEST_PLAYWRIGHT||'playwright');
const {spawn}=require('node:child_process');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const base='http://127.0.0.1:18773',server=spawn(process.env.H3_TEST_PYTHON||'python',[path.join(__dirname,'cpu_fixture.py'),'18773'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let browser,page,stderr='';server.stderr.on('data',x=>stderr+=x);
 try{
  for(let i=0;i<80;i++){try{await fetch(base+'/system_stats');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(12000);const errors=[],resolveCalls=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/resolve'))resolveCalls.push(r.postDataJSON());});
  await page.goto(base+'/extensions/h3_studio/index.html');await page.waitForFunction(()=>document.querySelector('#connectionText').textContent.includes('Connected')&&!state.projectLoading);
  await page.evaluate(()=>document.querySelectorAll('.workspace-stage,.workspace-fold').forEach(e=>e.open=true));await page.locator('[data-mode="refs"]').click();await page.locator('#preparationMode').selectOption('native');
  const image=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2304;c.height=1408;c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1];}),'base64');
  async function add(kind,file){await page.locator('#refKind').selectOption(kind);const chooser=page.waitForEvent('filechooser');await page.locator('#addRef').click();await(await chooser).setFiles(file);await page.waitForFunction(()=>!state.projectLoading);}
  await add('image',{name:'front.png',mimeType:'image/png',buffer:image});await add('image',{name:'back.png',mimeType:'image/png',buffer:image});
  await page.evaluate(()=>document.querySelectorAll('#refs details').forEach(e=>e.open=true));
  await page.locator('.ref-subject-group').nth(0).selectOption('__new');const group=await page.evaluate(()=>state.refs[0].subject_group);await page.locator('.ref-subject-group').nth(1).selectOption(group);
  await page.locator('.ref-additional-instruction').nth(0).fill('Keep the scar.');await page.locator('.ref-additional-instruction').nth(1).fill('Keep the coat.');
  await page.locator('.ref-original-resolution').nth(0).check();await page.locator('#prompt').fill('@front walks across the room.');
  const compiled=await page.evaluate(()=>H3PromptCompiler.compilePrompt(currentRenderSpec()));assert.deepEqual(compiled.bindings.map(x=>x.tag),['<Subject 1>','<Subject 1>']);assert.match(compiled.compiled_prompt,/<Picture 1> and <Picture 2>/);
  const local=await page.evaluate(async()=>{const draft=captureProjectDraft(true);await H3TabDraftStore.save(tabProjectDraftKey(state.activeProjectId||'unassigned'),draft);return draft.refs.map(x=>({group:x.subject_group,original:x.useOriginalResolution,instruction:x.instruction}));});
  await page.reload();await page.waitForFunction(()=>state.refs.length===2&&!state.projectLoading);assert.deepEqual(await page.evaluate(()=>state.refs.map(x=>({group:x.subject_group,original:x.useOriginalResolution,instruction:x.instruction}))),local);
  await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.refs.every(x=>x.assetId)&&projectCtrl.currentProject?.draft?.refs?.length===2&&!state.projectLoading);
  assert.equal(await page.evaluate(()=>projectCtrl.currentProject.draft.refs[0].subject_group),group);
  await page.evaluate(async()=>{const draft=structuredClone(projectCtrl.currentProject.draft);await restoreProjectTake({take_id:'reference-fixture',draft});});
  assert.equal(await page.evaluate(()=>state.refs[1].subject_group),group);assert.equal(await page.evaluate(()=>state.refs[0].useOriginalResolution),true);
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  const captured=await(await fetch(base+'/__captured')).json(),graph=captured.at(-1).prompt;const images=Object.values(graph).filter(x=>x.class_type==='LoadImage').map(x=>x.inputs.image);assert.equal(images.length,2);
  const dimensions=await Promise.all(images.map(filename=>fetch(base+'/__input_info?filename='+encodeURIComponent(filename)).then(r=>r.json())));assert.equal(dimensions[0].width,2304);assert.equal(dimensions[1].width,2048);assert.ok(resolveCalls.some(x=>x.resize===false));assert.ok(resolveCalls.some(x=>x.resize===true));
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.running&&!state.busy);
  const video=Buffer.from(await(await fetch(base+'/__fixtures/external-25fps.mp4')).arrayBuffer());await add('video',{name:'motion.mp4',mimeType:'video/mp4',buffer:video});
  const wav=Buffer.from(await(await fetch(base+'/__fixtures/voice.wav')).arrayBuffer());const audio=Buffer.concat([wav,wav.subarray(44)]);audio.writeUInt32LE(audio.length-8,4);audio.writeUInt32LE(audio.length-44,40);await add('audio',{name:'voice.wav',mimeType:'audio/wav',buffer:audio});
  await page.waitForFunction(()=>state.refs.length===4&&state.refs[3].localDuration>=4);
  await page.evaluate(()=>{for(const ref of state.refs.filter(x=>x.kind!=='image')){ref.trimEnabled=true;ref.trimStart=.5;ref.trimDuration=2;ref.expanded=true;}renderRefs();});
  const players=page.locator('.ref-source-player');await page.waitForFunction(()=>[...document.querySelectorAll('.ref-source-player')].length===2&&[...document.querySelectorAll('.ref-source-player')].every(x=>x.readyState>=1));
  assert.equal(await page.locator('.ref-segment-label').filter({hasText:'0.50–2.50 s'}).count(),2);
  await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.ref-source-player')].map(x=>x.play()));});
  await page.waitForFunction(()=>[...document.querySelectorAll('.ref-source-player')].every(x=>x.paused&&x.currentTime>=2.49),{},{timeout:7000});
  assert.ok((await players.evaluateAll(xs=>xs.map(x=>x.currentTime))).every(x=>x>=2.49&&x<=2.51));
  const cleanup=await page.evaluate(()=>{const previous=[...document.querySelectorAll('.ref-source-player')],urls=state.refs.map(x=>x.previewUrl),original=URL.createObjectURL;let created=0;URL.createObjectURL=(...args)=>{created++;return original(...args);};renderRefs();renderRefs();URL.createObjectURL=original;return {created,stable:state.refs.every((x,i)=>x.previewUrl===urls[i]),released:previous.every(x=>x.paused&&!x.hasAttribute('src'))};});
  assert.deepEqual(cleanup,{created:0,stable:true,released:true});
  await page.evaluate(()=>{state.refs[0].subject_group={bad:true};renderRefs();});assert.equal(await page.locator('.ref-policy-error').count(),1);assert.match(await page.evaluate(()=>{try{H3PromptCompiler.compilePrompt(currentRenderSpec());return '';}catch(e){return e.message;}}),/invalid character group/);
  await page.locator('.ref-subject-group').nth(0).selectOption('');assert.equal(await page.locator('.ref-policy-error').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['group aliases and native multi-picture definition','local reload, server save and Reuse retain group/instructions/quality override','real saved-image resolve sizes with per-image override','video and audio selected-segment stop and labels','rerender disposes players without creating or losing object URLs','malformed group visibly recoverable'],dimensions},null,2));
 }catch(error){console.error(error.stack);if(page)console.error(await page.evaluate(()=>({error:document.querySelector('#error').textContent,refs:state.refs.map(x=>({alias:x.alias,group:x.subject_group,kind:x.kind})),loading:state.projectLoading})).catch(()=>({})));console.error(stderr);process.exitCode=1;}
 finally{if(browser)await browser.close();server.kill();}
})();
