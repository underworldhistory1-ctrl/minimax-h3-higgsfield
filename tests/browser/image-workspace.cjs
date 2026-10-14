/* Image UI contracts: real browser files and drafts, simulated inference API. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');let browser;let uploads=[],graphs=[],uploadStatus=200;
(async()=>{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const url=new URL(route.request().url());let data;
 if(url.pathname==='/h3_studio/image_readiness')data={ready:true,profiles:{int8:{ready:true}},nodes:{}};
 else if(url.pathname==='/h3_studio/upload_ref'){const body=route.request().postDataJSON();uploads.push(body);assert.ok(route.request().headers()['content-type'].startsWith('application/json'));return uploadStatus===200?route.fulfill({json:{name:'h3_studio_kf_fixture.jpg'}}):route.fulfill({status:503,body:'Gateway unavailable'});}
 else if(url.pathname==='/prompt'&&route.request().method()==='POST'){graphs.push(route.request().postDataJSON().prompt);return route.fulfill({status:400,json:{error:{message:'Captured graph without GPU submission'}}});}
 else if(url.pathname==='/history')data={};else if(url.pathname==='/queue')data={queue_running:[],queue_pending:[]};else if(url.pathname.startsWith('/h3_studio/'))data={images:[],ok:true};
 if(data!==undefined)return route.fulfill({json:data});return route.continue();});
 await page.goto('http://127.0.0.1:18923/web/image.html');await page.waitForFunction(()=>state.ready&&state.referencesReady);
 const original=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
 await page.locator('#referenceFiles').setInputFiles({name:'hero.jpg',mimeType:'image/jpeg',buffer:original});await page.locator('#referenceFiles').setInputFiles({name:'look.jpg',mimeType:'image/jpeg',buffer:original});await page.waitForFunction(()=>state.refsSaved&&state.refs[0]?.width);
 assert.equal(await page.locator('#aspect').isEnabled(),true);assert.equal(await page.locator('#resolution').isEnabled(),true);
 await page.locator('#aspect').selectOption('9:16');await page.locator('#resolution').selectOption('1');await page.locator('#prompt').fill('Refine @hero photographically using @look.');await page.locator('#referenceResolution').selectOption('1536');
 assert.equal(await page.locator('#customSize').isChecked(),true);assert.ok((await page.locator('#dimensions').innerText()).includes('768 × 1344'));
 await page.reload();await page.waitForFunction(()=>state.referencesReady&&state.refs.length===2&&state.ready);
 assert.equal(await page.locator('#prompt').inputValue(),'Refine @hero photographically using @look.');assert.equal(await page.locator('#aspect').inputValue(),'9:16');assert.equal(await page.locator('#resolution').inputValue(),'1');assert.equal(await page.locator('#customSize').isChecked(),true);assert.equal(await page.evaluate(()=>state.refs[0].name),'hero');
 const other=await context.newPage();await other.goto('http://127.0.0.1:18923/web/image.html');await other.waitForFunction(()=>state.referencesReady);assert.equal(await other.locator('#prompt').inputValue(),'');assert.equal(await other.evaluate(()=>state.refs.length),0);
 await page.locator('#generate').click();await page.waitForFunction(()=>!state.busy&&document.getElementById('error').textContent.includes('Captured graph'));
 assert.equal(uploads.length,2);assert.equal(uploads[0].filename,'hero.jpg');assert.deepEqual(Buffer.from(uploads[0].data,'base64'),original);assert.equal(graphs[0].scale_primary.inputs.width,768);assert.equal(graphs[0].scale_primary.inputs.height,1344);assert.equal(graphs[0].enc.inputs.resolution,0);assert.equal(graphs[0].scale_ref2.inputs.megapixels,2.25);
 uploadStatus=503;await page.locator('#generate').click();await page.waitForFunction(()=>document.getElementById('error').textContent.includes('HTTP 503'));assert.equal(graphs.length,1);assert.equal(await page.evaluate(()=>state.refs.length),2);
 await page.locator('#customSize').uncheck();assert.ok((await page.locator('#dimensions').innerText()).includes('first reference'));assert.equal(await page.locator('#aspect').isEnabled(),true);
 await page.locator('#resolution').selectOption('4');assert.equal(await page.locator('#customSize').isChecked(),true);assert.ok((await page.locator('#dimensions').innerText()).includes('1536 × 2752'));
 await page.screenshot({path:path.resolve(root,'../browser-evidence/image-canvas-and-refresh.png')});assert.deepEqual(errors,[]);await browser.close();console.log('Image JSON upload, canvas graph, refresh and tab isolation passed; no GPU submitted.');
})().catch(async e=>{console.error(e);await browser?.close();process.exit(1);});
