const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compilePrompt}=require('../../web/h3/prompt-compiler.js');
const {buildGraph}=require('../../web/h3/graph-builder.js');
test('custom retention stays neutral and guided native tags fail closed',()=>{
 const r=compilePrompt({mode:'refs',source_prompt:'Use @v only as instructed.',references:[{alias:'v',kind:'video',role:'custom',fps:24,frame_count:48}]});
 assert.doesNotMatch(r.compiled_prompt,/Preserve the motion and sound/);
 assert.equal(r.bindings[0].used_frames,39);
 assert.ok(r.warnings.length);
 assert.throws(()=>compilePrompt({mode:'text',source_prompt:'Look at <Picture 1>.'}),/does not exist/);
});
test('guided shot sequence gets no duplicate Shot 1 and sounds cover sequence',()=>{
 for(const mode of ['text','frames']) {
 const r=compilePrompt({mode,frames:{first:'a'},source_prompt:'[Shot 1] Walk. [Shot 2] Speak.'});
 const desc=r.compiled_prompt.split('integrated_multimodal_description:')[1].split('overall_soundscape:')[0];
 assert.equal((desc.match(/\[Shot 1\]/g)||[]).length,1);
 assert.match(r.compiled_prompt,/sounds described in the full sequence/);
 }
});
test('reference soundtrack and frames are trimmed to matching native span',()=>{
 const g=buildGraph({mode:'refs',target_frames:124,references:[{asset_id:'v',kind:'video',fps:24,frame_count:150,use_audio:true}]},{v:'v.mp4'});
 const image=g['6'].inputs['ref_videos.ref_video_0']; const audio=g['6'].inputs['ref_video_audios.ref_video_audio_0'];
 assert.equal(g[image[0]].class_type,'ImageFromBatch');assert.equal(g[image[0]].inputs.length,124);
 assert.equal(g[audio[0]].class_type,'TrimAudioDuration');assert.equal(g[audio[0]].inputs.duration,124/24);
});
const control={enabled:true,model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',control_file:'c.mp4',kind:'pose',strength:1,start_percent:0,end_percent:1,fps:24,frame_count:124,width:1280,height:704};
test('control is capability gated, aligned and placed after sigma shift',()=>{
 assert.throws(()=>buildGraph({control}),/ControlNet.*unavailable/);
 for(const change of [{mode:'refs'},{refine:true},{continuation:{}},{control:{...control,fps:30}}])assert.throws(()=>buildGraph({control,...change},{},{controlnet_ready:true,refine_ready:true}));
 const g=buildGraph({control,loras:[{enabled:true,name:'a',strength:.5}]},{},{controlnet_ready:true});
 const apply=g[g['8'].inputs.model[0]];
 assert.equal(apply.class_type,'MiniMaxH3FunControlNetApply');
 assert.deepEqual(apply.inputs.model,['2',0]);
 assert.equal(g[g['2'].inputs.model[0]].class_type,'LoraLoaderModelOnly');
});
test('refine is capability gated and Motion Repair uses stage strength',()=>{
 assert.throws(()=>buildGraph({refine:true}),/refine.*unavailable/i);
 const g=buildGraph({refine:true,loras:[{enabled:true,name:'Motion_Repair_V2.safetensors',strength:.8}]},{},{refine_ready:true});
 const loads=Object.values(g).filter(n=>n.class_type==='LoraLoaderModelOnly');
 assert.deepEqual(loads.map(n=>n.inputs.strength_model),[.8,.25]);
});
test('structured roles bypass warning and native bindings apply in guided frames and refs',()=>{
 const source=['subject_definitions: None','summary: <Picture 1>','retention_analysis: Lighting only','detailed_description: [Shot 1] @a','overall_soundscape: Silence','non_diegetic_music: None'].join('\n');
 const r=compilePrompt({mode:'refs',prompt_mode:'structured',source_prompt:source,references:[{kind:'image',alias:'a',role:'custom',instruction:'Ignored card instruction'}]});
 assert.match(r.warnings.join(' '),/roles.*instructions are bypassed/);
 assert.doesNotMatch(r.compiled_prompt,/Ignored card instruction/);
 assert.throws(()=>compilePrompt({mode:'frames',frames:{first:'a'},source_prompt:'@start and <Video 1>'}),/does not exist/);
 assert.throws(()=>compilePrompt({mode:'refs',source_prompt:'@a and <Audio 1>',references:[{kind:'image',alias:'a',role:'custom'}]}),/does not exist/);
});
test('inpaint grayscale mask is converted from red channel and collisions preserve all nodes',()=>{
 const g=buildGraph({control:{...control,kind:'inpaint',mask_file:'mask.png',source_file:'source.mp4'},loras:Array.from({length:70},(_,i)=>({enabled:true,name:'l'+i,strength:.2}))},{},{controlnet_ready:true});
 assert.equal(Object.values(g).filter(n=>n.class_type==='LoraLoaderModelOnly').length,70);
 assert.equal(Object.values(g).find(n=>n.class_type==='ImageToMask').inputs.channel,'red');
 for(const node of Object.values(g))for(const input of Object.values(node.inputs))if(Array.isArray(input))assert.ok(g[input[0]]);
 assert.throws(()=>buildGraph({control:{...control,control_file:'../bad.mp4'}},{},{controlnet_ready:true}),/canonical control file/);
});
test('actual graph settings reject invalid steps canvas method and refine scale',()=>{
 for(const spec of [{steps:0},{steps:NaN},{width:0},{width:1281},{target_frames:3609},{render_method:'unknown'},{mode:'refs',render_method:'turbo'},{refine:true,refine_scale:NaN}])assert.throws(()=>buildGraph(spec,{},{refine_ready:true}));
});
test('preview allows missing metadata honestly while generation stays strict',()=>{
 const spec={mode:'refs',source_prompt:'Use @v.',references:[{alias:'v',kind:'video',role:'custom',use_audio:true,instruction:'Camera only'}]};
 assert.throws(()=>compilePrompt(spec),/verified canonical 24 fps/);
 const result=compilePrompt({...spec,preview_only:true});
 assert.match(result.warnings.join(' '),/effective span available after upload/);
 for(const key of ['used_frames','used_seconds','source_frames','fps','paired_audio_frames','paired_audio_seconds'])assert.equal(result.bindings[0][key],undefined);
 assert.equal(result.bindings[0].instruction,'Camera only');
 assert.throws(()=>compilePrompt({...spec,preview_only:true,references:[{...spec.references[0],fps:30}]}),/24 fps/);
 const verified=compilePrompt({...spec,preview_only:true,references:[{...spec.references[0],fps:24,frame_count:48}]});
 assert.equal(verified.bindings[0].used_frames,39);
 assert.equal(verified.bindings[0].paired_audio_frames,39);
});

test('inpaint supports source and mask without a control hint and cache wraps applied model',()=>{
 for(const render_method of ['native','spectrum','motioncache']) {
 const spec={render_method,control:{...control,kind:'inpaint',control_file:undefined,mask_file:'m.png',source_file:'s.mp4',start_percent:.2,end_percent:.8}};
 const g=buildGraph(spec,{},{controlnet_ready:true});
 const applyEntry=Object.entries(g).find(([id,n])=>n.class_type==='MiniMaxH3FunControlNetApply');
 const [applyId,apply]=applyEntry;
 assert.equal(apply.inputs.control_video,undefined);assert.ok(apply.inputs.mask);assert.ok(apply.inputs.source_video);
 assert.deepEqual(apply.inputs.model,['2',0]);assert.equal(apply.inputs.start_percent,.2);assert.equal(apply.inputs.end_percent,.8);
 const sampled=g[g['8'].inputs.model[0]];
 if(render_method==='native')assert.equal(sampled,apply);else assert.deepEqual(sampled.inputs.model,[applyId,0]);
 }
 assert.throws(()=>buildGraph({control:{...control,control_file:undefined}},{},{controlnet_ready:true}),/Prepared control video/);
});
