const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/h3/guidance-language.js'),'utf8');
function load(saved,blocked=false){
 const storage=new Map(saved?[['h3studio.guidance.language',saved]]:[]);
 const elements=['frames','references','keyframes','loras','model','sampling','style','swap','writer','controlStill'].map(key=>({dataset:{guidanceKey:key}}));
 const select={value:'',addEventListener(name,callback){this.change=callback;}};
 const document={querySelectorAll:()=>elements,getElementById:()=>select};
 const context={document,localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');storage.set(key,value);}}};
 vm.runInNewContext(source,context);return {api:context.H3Guidance,elements,select,storage};
}
test('contextual help defaults to English with left-to-right semantics',()=>{
 const {api,elements,select}=load();assert.equal(api.getLanguage(),'en');assert.equal(select.value,'en');
 for(const element of elements){assert.equal(element.lang,'en');assert.equal(element.dir,'ltr');assert.ok(element.textContent.length>30);assert.doesNotMatch(element.textContent,/[\u0600-\u06ff]/);}
});
test('switching help to Arabic updates existing and dynamic guidance and survives reload',()=>{
 const {api,elements,select,storage}=load();select.value='ar';select.change();
 assert.equal(api.getLanguage(),'ar');for(const element of elements){assert.equal(element.lang,'ar');assert.equal(element.dir,'rtl');assert.match(element.textContent,/[\u0600-\u06ff]/);}
 const dynamic={dataset:{}};api.setText(dynamic,'writerUnavailable');assert.match(dynamic.textContent,/Automatic/);assert.equal(dynamic.lang,'ar');
 assert.equal(load(storage.get('h3studio.guidance.language')).api.getLanguage(),'ar');
 api.setLanguage('en');assert.equal(select.value,'en');assert.equal(elements[0].dir,'ltr');
});
test('invalid preferences and unavailable storage retain a usable English default',()=>{
 assert.equal(load('fr').api.getLanguage(),'en');const {api,elements}=load(null,true);assert.equal(api.getLanguage(),'en');api.setLanguage('ar');assert.equal(elements[0].lang,'ar');
});
test('dynamic help retains current state and interpolation when language changes',()=>{
 const {api,elements}=load();const element={dataset:{}};elements.push(element);
 api.setText(element,'methodsReady',{methods:'Spectrum, MotionCache'});assert.match(element.textContent,/Ready on this server: Spectrum, MotionCache/);
 api.setLanguage('ar');assert.match(element.textContent,/Spectrum, MotionCache/);assert.match(element.textContent,/المتاح/);
 api.setText(element,'methodsOffline');api.setLanguage('en');assert.equal(element.textContent,'Connect ComfyUI to check installed speed methods.');
 api.setText(element,'promptFrames');api.setLanguage('ar');assert.match(element.textContent,/@start/);assert.equal(element.dataset.guidanceKey,'promptFrames');
 for(const key of ['stepsStandard','stepsTurbo','refineReady','refineUnavailable','promptText','promptRefs']){api.setText(element,key,{reasons:'Missing model'});assert.equal(element.lang,'ar');assert.match(element.textContent,/[\u0600-\u06ff]/);}
});
test('video entry loads guidance before dynamic panels and contains English static help',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../web/index.html'),'utf8');assert.ok(html.indexOf('h3/guidance-language.js')<html.indexOf('./studio.js'));
 assert.doesNotMatch(html,/class="workflow-help[^\"]*" lang="ar"/);assert.match(html,/id="guidanceLanguage"/);
 for(const name of ['configuration-ui.js','connected-studio.js']){const script=fs.readFileSync(path.join(__dirname,'../../web/h3',name),'utf8');assert.doesNotMatch(script,/[\u0600-\u06ff]/);}
});
test('standard explanatory text across video and image pages has both language versions',()=>{
 const {api}=load();let blocks=0;
 for(const page of ['index.html','image.html']){
  const html=fs.readFileSync(path.join(__dirname,'../../web',page),'utf8');
  assert.match(html,/id="guidanceLanguage"/);assert.ok(html.indexOf('h3/guidance-language.js')<html.indexOf(page==='index.html'?'./studio.js':'./image-studio.js'));
  for(const match of html.matchAll(/<(p|div|span)([^>]*)>([^<>]+)<\/\1>/g)){
   const attrs=match[2];if(!attrs.includes('data-guidance-key')&&(attrs.includes('id=')||attrs.includes('role=')||!(match[1]==='p'||/class="tip"/.test(attrs))))continue;
   assert.match(attrs,/data-guidance-key="([^"]+)"/,page+': '+match[3]);const key=attrs.match(/data-guidance-key="([^"]+)"/)[1];
   const element={dataset:{}};api.setLanguage('en');api.setText(element,key);assert.equal(element.lang,'en');assert.equal(element.textContent,match[3].replaceAll('&amp;','&'));
   api.setLanguage('ar');api.setText(element,key);assert.equal(element.lang,'ar');assert.match(element.textContent,/[\u0600-\u06ff]/);blocks++;
  }
 }
 assert.ok(blocks>=40,'all standard static descriptions and tips should be covered');
});
