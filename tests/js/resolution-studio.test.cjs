const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const H3GraphBuilder=require('../../web/h3/graph-builder.js');
const source=fs.readFileSync(require.resolve('../../web/studio.js'),'utf8');
const helpers=source.slice(source.indexOf('const samplingCanvas ='),source.indexOf('const fmt ='));
function context(){const context={state:{width:1920,height:1080},H3GraphBuilder};vm.createContext(context);vm.runInContext(helpers,context);return context;}
test('only new output presets require crop or final refine fit nodes',()=>{
 const c=context();
 assert.deepEqual(Array.from(c.outputCanvasNodes(1280,704,true)),[]);
 assert.deepEqual(Array.from(c.outputCanvasNodes(1664,928,false)),[]);
 assert.deepEqual(Array.from(c.outputCanvasNodes(1664,928,true)),['ImageScale']);
 assert.deepEqual(Array.from(c.outputCanvasNodes(1920,1080,false)),['ImageCrop']);
 assert.deepEqual(Array.from(c.outputCanvasNodes(1920,1080,true)),['ImageCrop','ImageScale']);
});
test('UI continuation precheck accepts generated1088 and imported1080 only',()=>{
 const c=context();
 for(const type of ['generated','imported']){
  const source_canvas={width:1920,height:type==='generated'?1088:1080};
  assert.equal(c.continuationCanvasMatches({type,source_canvas}),true);
  source_canvas.height=type==='generated'?1080:1088;
  assert.equal(c.continuationCanvasMatches({type,source_canvas}),false);
 }
});
test('muted motion video plus standalone dialogue audio remains allowed',()=>{
 const c=context(),motion={kind:'video',alias:'motion',useAudio:false},audio={kind:'audio',alias:'words'};
 assert.equal(c.requestsMutedSourceDialogue('Use @motion for movement. Keep the original dialogue from @words.',[motion,audio]),false);
 assert.equal(c.requestsMutedSourceDialogue('Preserve the original dialogue.',[motion,audio]),false);
 assert.equal(c.requestsMutedSourceDialogue('Use @motion for movement and keep the original dialogue from the audio reference.',[motion,audio]),false);
 assert.equal(c.requestsMutedSourceDialogue('Keep the original dialogue from @motion.',[motion,audio]),true);
 assert.equal(c.requestsMutedSourceDialogue('Keep the original dialogue.',[motion]),true);
 assert.equal(c.requestsMutedSourceDialogue("Do not keep the original dialogue from @motion.",[motion]),false);
 assert.equal(c.requestsMutedSourceDialogue('Keep the original dialogue from @talking.',[motion,{kind:'video',alias:'talking',useAudio:true}]),false);
});
