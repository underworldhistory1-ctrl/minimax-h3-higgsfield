const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildGraph}=require('../../web/h3/graph-builder.js');

test('Full HD remains selectable and preserves output with every text render method',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../web/studio.js'),'utf8');
 assert.match(source,/\[1920,1080,"Full HD/);
 for(const render_method of ['native','spectrum','motioncache','turbo']) {
  for(const refine of [false,true]) {
   const graph=buildGraph({mode:'text',width:1920,height:1080,target_frames:124,
    render_method,steps:render_method==='turbo'?8:20,refine},{},{refine_ready:true,turbo_ready:true});
   const input=Object.values(graph).find(n=>n.class_type==='MiniMaxH3ImageToVideo');
   assert.equal(input.inputs.width,1920);
   assert.equal(input.inputs.height,1088);
   const crop=Object.values(graph).find(n=>n.class_type==='ImageCrop');
   assert.equal(crop.inputs.width,1920);
   assert.equal(crop.inputs.height,1080);
   assert.equal(crop.inputs.y,4);
  }
 }
});
