const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {buildGraph}=require('../../web/h3/graph-builder.js');
const {canvasFor}=require('../../web/h3/graph-builder.js');

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

test('Portrait Full HD uses the same token budget and preserves all supported methods and modes',()=>{
 const landscape=canvasFor(1920,1080),portrait=canvasFor(1080,1920);
 assert.equal(portrait.width,1088);assert.equal(portrait.height,1920);
 assert.equal(portrait.width*portrait.height,landscape.width*landscape.height);
 assert.deepEqual(portrait.crop,{width:1080,height:1920,x:4,y:0});
 for(const mode of ['text','frames','refs'])for(const render_method of ['native','spectrum','motioncache','turbo']) {
  if(mode==='refs'&&render_method==='turbo')continue;
  for(const refine of [false,true]) {
   const graph=buildGraph({mode,width:1080,height:1920,target_frames:362,render_method,
    steps:render_method==='turbo'?8:20,refine,frames:{first:'first.png',last:'last.png',ref:'reference.png'},
    references:mode==='refs'?[{kind:'image',asset_id:'ref'}]:[]},{first:'first.png',last:'last.png',ref:'reference.png'},{refine_ready:true,turbo_ready:true});
   assert.equal(graph['6'].inputs.width,1088);assert.equal(graph['6'].inputs.height,1920);
   const crop=graph[graph['11'].inputs.images[0]];
   assert.equal(crop.class_type,'ImageCrop');
   assert.deepEqual({...crop.inputs,image:undefined},{image:undefined,width:1080,height:1920,x:4,y:0});
   if(refine){const fit=graph[crop.inputs.image[0]];assert.equal(fit.class_type,'ImageScale');assert.equal(fit.inputs.width,1088);assert.equal(fit.inputs.height,1920);}
   if(render_method==='motioncache')assert.ok(Object.values(graph).some(n=>n.class_type==='MiniMaxH3MotionCache'));
  }
 }
});

test('Portrait continuation uses padded dimensions for saved latents and exact dimensions for uploaded video',()=>{
 for(const type of ['generated','imported']) {
  const source_canvas=type==='generated'?{width:1088,height:1920}:{width:1080,height:1920};
  const graph=buildGraph({width:1080,height:1920,continuation:{type,source_token:'saved',source_file:'source.mp4',source_canvas,context_length:39}},{},{continuation_ready:true});
  assert.equal(graph[graph['11'].inputs.images[0]].class_type,'ImageCrop');
 }
 assert.throws(()=>buildGraph({width:1080,height:1920,control:{enabled:true,model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',kind:'pose',control_file:'control.mp4',fps:24,frame_count:124,width:1080,height:1920}},{},{controlnet_ready:true}),/Prepared control metadata/);
 const graph=buildGraph({width:1080,height:1920,control:{enabled:true,model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',kind:'pose',control_file:'control.mp4',fps:24,frame_count:124,width:1088,height:1920}},{},{controlnet_ready:true});
 assert.equal(graph['6'].inputs.width,1088);
});
