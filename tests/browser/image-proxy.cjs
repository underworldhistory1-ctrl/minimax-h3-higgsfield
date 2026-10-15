/* Real image workspace through root and provider-prefixed HTTP routes; no GPU. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');

async function checkWorkspace(browser,prefix){
  const seen=[],uploads=[],graphs=[],sockets=[];
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    seen.push({method:req.method,path:url.pathname});
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(!url.pathname.startsWith(prefix+'/'))return send(404,{error:'Outside ComfyUI proxy'});
    const route=url.pathname.slice(prefix.length);
    if(route.startsWith('/extensions/h3_studio/')){
      const file=path.join(root,'web',route.slice('/extensions/h3_studio/'.length));
      if(!fs.existsSync(file))return send(404,{error:'Missing static file'});
      const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html';
      res.writeHead(200,{'Content-Type':type});return res.end(fs.readFileSync(file));
    }
    if(route==='/h3_studio/image_readiness')return send(200,{ready:true,profiles:{int8:{ready:true},bf16:{ready:false}},nodes:{}});
    if(route==='/h3_studio/image_library')return send(200,{items:[]});
    if(route==='/h3_studio/updates/status')return send(200,{state:'idle'});
    if(route==='/h3_studio/updates/check')return send(200,{state:'current'});
    if(route==='/h3_studio/upload_ref'){
      let body='';for await(const chunk of req)body+=chunk;
      uploads.push(JSON.parse(body));return send(200,{name:'h3_studio_kf_proxy.jpg'});
    }
    if(route==='/prompt'&&req.method==='POST'){
      let body='';for await(const chunk of req)body+=chunk;
      graphs.push(JSON.parse(body).prompt);
      return send(400,{error:{message:'Captured image graph without GPU submission'}});
    }
    if(route==='/h3_studio/discard')return send(200,{ok:true});
    if(route==='/queue')return send(200,{queue_running:[],queue_pending:[]});
    if(route==='/history')return send(200,{});
    return send(404,{error:'Unknown fixture route'});
  });
  server.on('upgrade',(req,socket)=>{
    sockets.push(socket);seen.push({method:'WS',path:new URL(req.url,'http://localhost').pathname});
    const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}/extensions/h3_studio/image.html`);
    await page.waitForFunction(()=>state.referencesReady&&(state.ready||document.getElementById('connection').classList.contains('down')));
    assert.equal(await page.locator('#generate').isEnabled(),true,await page.locator('#connectionText').innerText());
    const original=fs.readFileSync(path.join(root,'docs/demo/superman/character-reference-preview.jpg'));
    await page.locator('#referenceFiles').setInputFiles({name:'hero.jpg',mimeType:'image/jpeg',buffer:original});
    await page.waitForFunction(()=>state.refsSaved&&state.refs[0]?.width);
    await page.locator('#prompt').fill('Make @hero a natural photographic portrait.');
    await page.locator('#generate').click();
    await page.waitForFunction(()=>!state.busy&&document.getElementById('error').textContent.includes('Captured image graph'));
    assert.equal(uploads.length,1);assert.deepEqual(Buffer.from(uploads[0].data,'base64'),original);
    assert.equal(graphs.length,1);assert.ok(Object.values(graphs[0]).some(node=>node.class_type==='TextEncodeQwenImage21'));
    assert.ok(seen.some(r=>r.method==='WS'&&r.path===prefix+'/ws'),'Progress socket must use the ComfyUI prefix');
    assert.ok(seen.some(r=>r.method==='POST'&&r.path===prefix+'/prompt'));
    if(prefix)assert.equal(seen.some(r=>r.path.startsWith('/h3_studio/')||r.path==='/prompt'||r.path==='/ws'),false,'No requests may escape the provider prefix');
    assert.deepEqual(errors,[]);
  }finally{
    await context.close();for(const socket of sockets)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{await checkWorkspace(browser,'');await checkWorkspace(browser,'/jobs/demo/jobs/worker/proxy/8188');}
  finally{await browser.close();}
  console.log('Image readiness, references, Generate and progress use root/provider prefixes; no GPU submitted.');
})().catch(error=>{console.error(error);process.exit(1);});
