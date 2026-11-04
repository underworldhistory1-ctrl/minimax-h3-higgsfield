/* Real browser, real project/graph routes, simulated inference capabilities. */
const {chromium}=require(process.env.H3_TEST_PLAYWRIGHT||'playwright');
const {spawn}=require('node:child_process');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const base='http://127.0.0.1:18775',server=spawn(process.env.H3_TEST_PYTHON||'python',[path.join(__dirname,'cpu_fixture.py'),'18775'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let browser,page,stderr='';server.stderr.on('data',x=>stderr+=x);
 try{
  for(let i=0;i<80;i++){try{await fetch(base+'/system_stats');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:1050}});page.setDefaultTimeout(12000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/extensions/h3_studio/index.html');await page.waitForFunction(()=>document.querySelector('#connectionText').textContent.includes('Connected')&&!state.projectLoading);
  if(process.env.H3_UI_SCREENSHOT)await page.screenshot({path:process.env.H3_UI_SCREENSHOT.replace(/\.png$/,'-initial.png'),fullPage:true});
  assert.equal(await page.locator('.workspace-stage').count(),4);
  assert.equal(await page.locator('#fold-workspace').getAttribute('open'),null);
  // Focusing a summary must not expand it; one mouse click and Enter each toggle once.
  const workspace=page.locator('#fold-workspace > summary');await workspace.focus();assert.equal(await page.locator('#fold-workspace').getAttribute('open'),null);
  await workspace.click();assert.notEqual(await page.locator('#fold-workspace').getAttribute('open'),null);await workspace.press('Enter');assert.equal(await page.locator('#fold-workspace').getAttribute('open'),null);
  await page.locator('.workspace-jumps button').filter({hasText:'Workspace'}).click();
  assert.notEqual(await page.locator('#fold-workspace').getAttribute('open'),null);
  // A fresh scene opens Elements through the real project-creation navigation.
  await page.getByRole('button',{name:'Open reusable assets',exact:true}).click();await page.waitForFunction(()=>document.body.dataset.workspaceView==='elements'&&!!state.currentProject&&!state.projectLoading);
  await page.locator('[data-workspace-nav="studio"]').click();
  await page.locator('[data-mode="refs"]').click();assert.equal(await page.locator('#fold-references-section').isVisible(),true);assert.equal(await page.locator('#fold-frames-section').isVisible(),false);
  const image=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;c.getContext('2d').fillRect(0,0,320,240);return c.toDataURL('image/png').split(',')[1];}),'base64');
  async function add(role,names,button='#addRef'){
   await page.locator('#refBatchRole').selectOption(role);const chooser=page.waitForEvent('filechooser');await page.locator(button).click();await(await chooser).setFiles(names.map(name=>({name:name+'.png',mimeType:'image/png',buffer:image})));await page.waitForFunction(()=>!state.projectLoading);
  }
  await add('character identity',['front','side','back']);await add('location',['room','door']);await add('object',['prop','prop_side']);
  assert.equal(await page.locator('.reference-group').count(),3);
  assert.deepEqual(await page.locator('.reference-group-views').evaluateAll(xs=>xs.map(x=>x.querySelectorAll('.compact-ref').length)),[3,2,2]);
  const positions=await page.locator('.reference-group-views').first().locator('.compact-ref').evaluateAll(xs=>xs.map(x=>({x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y})));
  assert.equal(positions[0].y,positions[1].y);assert.notEqual(positions[0].x,positions[1].x);
  await page.locator('#prompt').fill('@back holds @prop inside @door.');
  const compiled=await page.evaluate(()=>H3PromptCompiler.compilePrompt(currentRenderSpec()));
  assert.deepEqual(compiled.bindings.map(x=>x.tag),['<Subject 1>','<Subject 1>','<Subject 1>','<Subject 2>','<Subject 2>','<Subject 3>','<Subject 3>']);
  assert.equal(await page.locator('#promptAssets .prompt-asset').count(),3);assert.equal(await page.locator('#promptAssets .prompt-asset.used').count(),3);
  // Adding a view uses the group's own role, independent of the batch selector.
  await add('object',['ceiling'],'.reference-group:nth-child(2) .reference-group-heading button:last-child');
  assert.equal(await page.evaluate(()=>state.refs.at(-1).role),'location');
  // Noncontiguous environment members reorder within their own group only.
  await page.locator('.reference-group:nth-child(2) .compact-ref').first().locator('summary').click();
  await page.locator('.reference-group:nth-child(2) .compact-ref').first().getByTitle('Move later within this reference group or media type',{exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>state.refs.filter(r=>r.role==='location').map(r=>r.alias)),['door','room','ceiling']);
  assert.deepEqual(await page.evaluate(()=>state.refs.filter(r=>r.role==='object').map(r=>r.alias)),['prop','prop_side']);
  await page.locator('#fold-prompt-section > summary').click();assert.equal(await page.locator('#prompt').isVisible(),false);
  await page.reload();await page.waitForFunction(()=>state.refs.length===8&&!state.projectLoading);
  assert.equal(await page.locator('#prompt').isVisible(),false);
  await page.locator('.reference-group-heading button').filter({hasText:'Insert @front'}).click();assert.equal(await page.locator('#prompt').isVisible(),true);
  await page.locator('#prompt').fill('@back holds @prop inside @door.');
  await page.locator('#fold-preparation-section > summary').click();await page.locator('#preparationMode').selectOption('native');
  await page.locator('#btnSaveProject').click();await page.waitForFunction(()=>state.refs.every(x=>x.assetId)&&!state.projectLoading);
  const saved=await page.evaluate(()=>projectCtrl.currentProject.draft.refs.map(x=>({alias:x.alias,group:x.subject_group,role:x.role})));assert.equal(saved.length,8);
  await page.locator('#generate').click();await page.waitForFunction(()=>state.running&&!String(state.running).startsWith('request:'));
  const captured=await(await fetch(base+'/__captured')).json(),graph=captured.at(-1).prompt;
  assert.equal(Object.values(graph).filter(x=>x.class_type==='LoadImage').length,8);
  assert.equal(Object.keys(graph['6'].inputs).filter(key=>key.startsWith('ref_images.ref_image_')).length,8);
  await page.locator('#cancel').click();await page.waitForFunction(()=>!state.busy&&!state.running);
  // Closed prompt errors reveal their section rather than disappearing in the rail.
  await page.locator('#fold-prompt-section > summary').click();await page.evaluate(()=>info('Review this prompt.',true));await page.waitForFunction(()=>document.querySelector('#fold-prompt-section').open);
  if(process.env.H3_UI_SCREENSHOT){await page.locator('.workspace-jumps button').filter({hasText:'Shot inputs'}).click();await page.screenshot({path:process.env.H3_UI_SCREENSHOT,fullPage:true});}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.workspace-jumps button').filter({hasText:'Collapse all'}).click();assert.equal(await page.locator('.workspace-stage[open]').count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['single-click/keyboard folding','jump navigation and fresh Elements creation','grouped character/environment/element uploads and horizontal views','one mention includes all pictures','group add-view role preserved','fold/group persistence after reload and save','eight independent graph image inputs','error reveal and narrow layout']},null,2));
 }catch(error){console.error(error.stack);if(page)console.error(await page.evaluate(()=>({error:document.querySelector('#error')?.textContent,refs:state.refs.map(x=>({alias:x.alias,group:x.subject_group,role:x.role})),view:document.body.dataset.workspaceView,loading:state.projectLoading})).catch(()=>({})));console.error(stderr);process.exitCode=1;}
 finally{if(browser)await browser.close();server.kill();}
})();
