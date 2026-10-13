/**
 * Unit tests for H3 Studio Lab Graph Builder.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildGraph, canvasFor } = require('../../web/h3/graph-builder.js');

test('resolution-only retry keeps sampler, model, reference identity and duration unchanged',()=>{
  const spec={mode:'refs',width:864,height:480,target_frames:311,seed:42,steps:20,
    compiled_prompt:'Follow <Picture 1> with <Subject 1>.',ref_size:'max',
    loras:[{name:'Motion_Repair_V2.safetensors',strength:.9}],
    references:[{kind:'image',alias:'frame',asset_id:'frame-id'},{kind:'image',alias:'person',asset_id:'person-id'}]};
  const assets={frame:'frame.png',person:'person.png'};
  const draft=buildGraph(spec,assets),large=buildGraph({...spec,width:1664,height:928},assets);
  const normalize=g=>{const clone=structuredClone(g);delete clone['6'].inputs.width;delete clone['6'].inputs.height;return clone;};
  assert.deepEqual(normalize(draft),normalize(large));
  assert.equal(large['6'].inputs.length,311);
});

test('new high resolution presets sample on the native grid and preserve selected outputs',()=>{
  assert.deepEqual(canvasFor(1920,1080),{width:1920,height:1088,outputWidth:1920,outputHeight:1080,crop:{width:1920,height:1080,x:0,y:4}});
  assert.throws(()=>canvasFor(1280,720),/multiples of 32/);
  for(const mode of ['text','frames','refs'])for(const [width,height] of [[1664,928],[1920,1080]]){
    const spec={mode,width,height,frames:{first:'start'},references:[{kind:'image',alias:'hero',asset_id:'shared'}]};
    const g=buildGraph(spec,{first:'start.png',hero:'hero.png'});
    assert.equal(g['6'].inputs.width,width);assert.equal(g['6'].inputs.height,height===1080?1088:height);
    const image=g[g['11'].inputs.images[0]];
    if(height===1080){assert.equal(image.class_type,'ImageCrop');assert.deepEqual(image.inputs,{image:['9',0],width:1920,height:1080,x:0,y:4});}
    else assert.deepEqual(g['11'].inputs.images,['9',0]);
    assert.equal(g['8'].inputs.steps,20);assert.equal(g['8'].inputs.sampler_name,'res_multistep');
  }
});

test('new preset refinement fits the selected output while old refinement graphs stay unchanged',()=>{
  for(const [width,height] of [[1664,928],[1920,1080],[1280,704]]){
    const g=buildGraph({width,height,refine:true},{},{refine_ready:true});
    const fit=Object.values(g).find(n=>n.class_type==='ImageScale');
    if(width===1280){assert.equal(fit,undefined);assert.deepEqual(g['11'].inputs.images,['9',0]);}
    else {assert.equal(fit.inputs.upscale_method,'lanczos');assert.equal(fit.inputs.crop,'center');assert.equal(fit.inputs.width,width);assert.equal(fit.inputs.height,height===1080?1088:height);}
  }
});

test('1080 continuation crops after AV trim and uses internal generated versus output imported source dimensions',()=>{
  for(const type of ['generated','imported']){
    const continuation={type,source_token:'abcdef123456',source_file:'source.mp4',source_canvas:{width:1920,height:type==='generated'?1088:1080}};
    const g=buildGraph({width:1920,height:1080,target_frames:175,continuation},{},{continuation_ready:true});
    const crop=g[g['11'].inputs.images[0]],trim=g[crop.inputs.image[0]];
    assert.equal(crop.class_type,'ImageCrop');assert.equal(trim.class_type,'H3LabTrimAV');assert.deepEqual(g['11'].inputs.audio,[crop.inputs.image[0],1]);
    if(type==='generated')assert.equal(Object.values(g).find(n=>n.class_type==='H3LabLoadContext').inputs.height,1088);
    continuation.source_canvas.height=type==='generated'?1080:1088;
    assert.throws(()=>buildGraph({width:1920,height:1080,target_frames:175,continuation},{},{continuation_ready:true}),/canvas/);
  }
});

test('1080 ControlNet metadata must describe the real sampling grid',()=>{
  const control={enabled:true,kind:'inpaint',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',fps:24,frame_count:124,width:1920,height:1088,source_file:'source.mp4',mask_file:'mask.png'};
  const g=buildGraph({width:1920,height:1080,target_frames:124,control},{},{controlnet_ready:true});
  assert.equal(g['6'].inputs.height,1088);assert.equal(g[g['11'].inputs.images[0]].class_type,'ImageCrop');
  assert.throws(()=>buildGraph({width:1920,height:1080,target_frames:124,control:{...control,height:1080}},{},{controlnet_ready:true}),/metadata/);
});

test('prepared reference aliases win over shared saved asset IDs and inherited properties never resolve',()=>{
  const references=[{kind:'image',alias:'crop',asset_id:'shared'},{kind:'image',alias:'contain',asset_id:'shared'}];
  const g=buildGraph({mode:'refs',references},{shared:'original.png',crop:'crop.png',contain:'contain.png'});
  assert.deepEqual(Object.values(g).filter(n=>n.class_type==='LoadImage').map(n=>n.inputs.image),['crop.png','contain.png']);
  for(const key of ['constructor','toString','__proto__']){
    assert.throws(()=>buildGraph({mode:'refs',references:[{kind:'image',alias:key,asset_id:key}]}),/not been resolved/);
    const assets=Object.create(null);assets[key]='safe.png';
    assert.equal(Object.values(buildGraph({mode:'refs',references:[{kind:'image',alias:key}]},assets)).find(n=>n.class_type==='LoadImage').inputs.image,'safe.png');
  }
  assert.throws(()=>buildGraph({mode:'refs',references},Object.create({crop:'inherited.png',contain:'inherited.png'})),/not been resolved/);
  for(const bad of [{},()=>{},'', '../escape.png','C:/escape.png','bad\\file.png'])assert.throws(()=>buildGraph({mode:'refs',references:[references[0]]},{crop:bad,shared:'valid.png'}),/canonical asset/);
  assert.throws(()=>buildGraph({mode:'frames',frames:{first:'constructor'}}),/not been resolved/);
  assert.throws(()=>buildGraph({guides:[{asset_id:'constructor',frame_idx:0}]}),/not been resolved/);
});

test('continuation rejects overlapping frame mode, canvas mismatch and checkpoint switching',()=>{
  const base={mode:'text',width:1280,height:704,target_frames:175,continuation:{type:'generated',source_token:'abcdef123456',source_model:'minimax_h3_fl2va_pruned_int8_convrot.safetensors',source_canvas:{width:1280,height:704}}};
  const caps={continuation_ready:true};
  assert.throws(()=>buildGraph({...base,mode:'frames'}, {},caps),/protected source context/);
  assert.throws(()=>buildGraph({...base,width:704,height:1280}, {},caps),/canvas/);
  assert.throws(()=>buildGraph({...base,mode:'refs'}, {},caps),/re-encode/);
});

describe('H3 Graph Builder', () => {
  test('frames mode: first and last frames use nodes 15 and 16, avoiding node 13 collision', () => {
    const spec = {
      mode: 'frames',
      compiled_prompt: 'Test frames prompt',
      width: 1280,
      height: 704,
      target_frames: 124,
      token: 'abcd1234ef56',
    };
    const resolvedAssets = {
      first: 'uploaded_start.png',
      last: 'uploaded_end.png',
    };

    const g = buildGraph(spec, resolvedAssets);

    // Node 13 is H3ReleaseForDecode
    assert.equal(g["13"].class_type, "H3ReleaseForDecode");
    // Node 15 is first_frame LoadImage
    assert.equal(g["15"].class_type, "LoadImage");
    assert.equal(g["15"].inputs.image, "uploaded_start.png");
    assert.deepEqual(g["6"].inputs.first_frame, ["15", 0]);

    // Node 16 is last_frame LoadImage
    assert.equal(g["16"].class_type, "LoadImage");
    assert.equal(g["16"].inputs.image, "uploaded_end.png");
    assert.deepEqual(g["6"].inputs.last_frame, ["16", 0]);

    // Node 12 is H3SaveVideo
    assert.equal(g["12"].class_type, "H3SaveVideo");
    assert.equal(g["12"].inputs.filename_prefix, "video/h3_studio_abcd1234ef56");
  });

  test('references mode: paired video soundtrack index matches video index', () => {
    const spec = {
      mode: 'refs',
      compiled_prompt: 'Refs with video audio',
      width: 1280,
      height: 704,
      target_frames: 124,
      token: '112233445566',
      references: [
        { asset_id: 'vid1', alias: 'clip1', kind: 'video', fps:24, frame_count:124, role: 'motion', use_audio: false },
        { asset_id: 'vid2', alias: 'clip2', kind: 'video', fps:24, frame_count:124, role: 'whole scene', use_audio: true },
      ],
    };
    const resolvedAssets = {
      vid1: 'clip1.mp4',
      vid2: 'clip2.mp4',
    };

    const g = buildGraph(spec, resolvedAssets);

    // Video 0 (clip1) has no audio
    assert.ok(g["6"].inputs["ref_videos.ref_video_0"], "Video 0 connected");
    assert.equal(g["6"].inputs["ref_video_audios.ref_video_audio_0"], undefined, "Video 0 soundtrack should not be connected");

    // Video 1 (clip2) has use_audio -> soundtrack on ref_video_audios.ref_video_audio_1
    assert.ok(g["6"].inputs["ref_videos.ref_video_1"], "Video 1 connected");
    const audioLink = g["6"].inputs["ref_video_audios.ref_video_audio_1"];
    assert.ok(audioLink, "Video 1 soundtrack must be connected at index 1");
    // Soundtrack is cropped after the same video's component split
    const splitNodeId = audioLink[0];
    assert.equal(g[splitNodeId].class_type, "TrimAudioDuration");
    assert.equal(g[g[splitNodeId].inputs.audio[0]].class_type, 'GetVideoComponents');
    assert.equal(audioLink[1], 0, 'Trimmed audio output is slot 0');
  });

  test('temporal guides chain MiniMaxH3AddGuide positive conditioning to sampler', () => {
    const spec = {
      mode: 'refs',
      compiled_prompt: 'Refs with guides',
      width: 1280,
      height: 704,
      target_frames: 175,
      token: 'guide1234567',
      references: [
        { asset_id: 'img1', alias: 'char', kind: 'image', role: 'character identity' }
      ],
      guides: [
        { asset_id: 'start_guide', frame_idx: 0, filename: 'g_start.png' },
        { asset_id: 'mid_guide', frame_idx: 88, filename: 'g_mid.png' },
      ]
    };
    const resolvedAssets = {
      img1: 'char.png',
      start_guide: 'g_start.png',
      mid_guide: 'g_mid.png',
    };

    const g = buildGraph(spec, resolvedAssets);

    // First guide node (70): positive from ["6", 0]
    assert.equal(g["70"].class_type, "MiniMaxH3AddGuide");
    assert.deepEqual(g["70"].inputs.positive, ["6", 0]);
    assert.equal(g["70"].inputs.frame_idx, 0);

    // Second guide node (72): positive chained from ["70", 0]
    assert.equal(g["72"].class_type, "MiniMaxH3AddGuide");
    assert.deepEqual(g["72"].inputs.positive, ["70", 0]);
    assert.equal(g["72"].inputs.frame_idx, 88);

    // Sampler (node 8) positive receives the last guide in chain ["72", 0]
    assert.deepEqual(g["8"].inputs.positive, ["72", 0], "KSampler positive must receive chained guide output");
  });

  test('generated continuation links MiniMaxH3GeneratedAVMaskedContext', () => {
    const spec = {
      mode: 'text',
      compiled_prompt: 'Continuation prompt',
      width: 1280,
      height: 704,
      target_frames: 175,
      token: 'extend123456',
      continuation: {
        type: 'generated',
        source_token: 'source_latent_tok',
        context_length: 39,
        audio_feather_ticks: 8,
      }
    };

    const g = buildGraph(spec, {}, { continuation_ready: true });

    // Latent load node 86
    assert.equal(g["86"].class_type, "H3LabLoadContext");
    assert.equal(g["86"].inputs.token, "source_latent_tok");

    // Context node 85
    assert.equal(g["85"].class_type, "MiniMaxH3GeneratedAVMaskedContext");
    assert.deepEqual(g["85"].inputs.latent, ["6", 1]);
    assert.deepEqual(g["85"].inputs.source_latent, ["86", 0]);
    assert.equal(g["85"].inputs.context_length, 39);

    // Sampler latent_image comes from masked context output
    assert.deepEqual(g["8"].inputs.latent_image, ["85", 0]);
  });

  test('imported continuation links MiniMaxH3ExistingVideoMaskedContext', () => {
    const spec = {
      mode: 'text',
      compiled_prompt: 'Import continuation',
      width: 1280,
      height: 704,
      target_frames: 175,
      token: 'import123456',
      continuation: {
        type: 'imported',
        source_file: 'input_video.mp4',
        context_length: 39,
        audio_feather_ticks: 8,
      }
    };

    const g = buildGraph(spec, {}, { continuation_ready: true });

    assert.equal(g["85"].class_type, "MiniMaxH3ExistingVideoMaskedContext");
    assert.deepEqual(g["85"].inputs.latent, ["6", 1]);
    assert.deepEqual(g["85"].inputs.vae, ["4", 0]);
    assert.deepEqual(g["85"].inputs.audio_vae, ["5", 0]);
    assert.equal(g["85"].inputs.context_length, 39);
    assert.deepEqual(g["8"].inputs.latent_image, ["85", 0]);
  });
});


test('zero seed and LoRA strength survive; many guides cannot overwrite nodes', () => {
  const guides = Array.from({length: 12}, (_, i) => ({file: `guide${i}.png`, frame_idx: i}));
  const g = buildGraph({seed: 0, loras: Array.from({length: 12}, (_, i) => ({enabled: true, name: `lora${i}`, strength: 0})), guides, continuation: {type: 'generated', source_token: 'source', context_length: 39}}, {}, {continuation_ready: true});
  assert.equal(g['8'].inputs.seed, 0);
  const nodes = Object.values(g);
  assert.equal(nodes.filter(n => n.class_type === 'LoraLoaderModelOnly').length, 12);
  assert.ok(nodes.filter(n => n.class_type === 'LoraLoaderModelOnly').every(n => n.inputs.strength_model === 0));
  assert.equal(nodes.filter(n => n.class_type === 'MiniMaxH3AddGuide').length, 12);
  assert.equal(nodes.filter(n => n.class_type === 'H3LabTrimAV').length, 1);
  assert.equal(g[g['11'].inputs.images[0]].class_type, 'H3LabTrimAV');
  assert.deepEqual(g['11'].inputs.audio, [g['11'].inputs.images[0], 1]);
});

test('unresolved references and malformed guide timeline fail closed', () => {
  assert.throws(() => buildGraph({mode: 'refs', references: [{kind: 'image', asset_id: 'missing'}]}), /not been resolved/);
  for (const frame_idx of [-1, 124, 1.5, '2', NaN]) assert.throws(() => buildGraph({guides: [{file:'g.png', frame_idx}]}), /guide frame index/);
  assert.throws(() => buildGraph({continuation: {type:'generated', source_token:'s'}}), /unavailable/);
  assert.throws(() => buildGraph({continuation: {type:'unknown', source_token:'s'}}, {}, {continuation_ready:true}), /Unknown continuation/);
});

test('new-content guide offsets include protected AV context', () => {
  const g = buildGraph({guides: [{file:'g.png', frame_idx:3, relative_to_new_content:true}], continuation:{type:'imported', source_file:'source.mp4', context_length:39}}, {}, {continuation_ready:true});
  assert.equal(Object.values(g).find(n => n.class_type === 'MiniMaxH3AddGuide').inputs.frame_idx, 42);
});


test('timed audio and video guides bind actual native AV inputs', () => {
  const guides = [{kind:'audio',file:'voice.wav',frame_idx:24},{kind:'video',file:'motion.mp4',frame_idx:30,fps:24,duration_frames:48,use_audio:true}];
  const g=buildGraph({guides}, {}, {guide_audio:true,guide_video:true});
  const nodes=Object.values(g).filter(n=>n.class_type==='MiniMaxH3AddGuide');
  assert.equal(nodes.length,2);
  assert.deepEqual(nodes[0].inputs.audio_vae,['5',0]);
  assert.equal(nodes[0].inputs.image,undefined);
  assert.equal(g[nodes[0].inputs.audio[0]].class_type,'LoadAudio');
  assert.equal(g[nodes[1].inputs.image[0]].class_type,'GetVideoComponents');
  assert.deepEqual(nodes[1].inputs.audio,[nodes[1].inputs.image[0],1]);
  assert.deepEqual(nodes[1].inputs.vae,['4',0]);
  assert.deepEqual(nodes[1].inputs.audio_vae,['5',0]);
});

test('timed AV guides fail closed without capability or verified video span', () => {
  assert.throws(()=>buildGraph({guides:[{kind:'audio',file:'a.wav',frame_idx:0}]}),/audio guides are unavailable/);
  assert.throws(()=>buildGraph({guides:[{kind:'video',file:'a.mp4',frame_idx:0}]}),/video guides are unavailable/);
  assert.throws(()=>buildGraph({guides:[{kind:'video',file:'a.mp4',frame_idx:0,fps:24}]},{},{guide_video:true}),/verified frame count/);
  assert.throws(()=>buildGraph({guides:[{kind:'video',file:'a.mp4',frame_idx:100,fps:24,duration_frames:48}]},{},{guide_video:true}),/past the target timeline/);
});


test('video guide validates the native cropped 17k+5 span', () => {
  const spec={guides:[{kind:'video',file:'v.mp4',frame_idx:85,fps:24,frame_count:48}]};
  const g=buildGraph(spec,{},{guide_video:true});
  assert.equal(Object.values(g).find(n=>n.class_type==='MiniMaxH3AddGuide').inputs.frame_idx,85);
  spec.guides[0].frame_idx=86;
  assert.throws(()=>buildGraph(spec,{},{guide_video:true}),/past the target timeline/);
});


test('refine disabled: graph keeps original single-pass sampler directly to node 13', () => {
  const spec = { mode: 'text', token: '001122334455', refine: false };
  const g = buildGraph(spec);
  assert.equal(g["13"].inputs.samples[0], "8");
  assert.equal(Object.values(g).some(n => n.class_type === 'MinimaxH3LatentUpscaler3D'), false);
  assert.equal(Object.values(g).some(n => n.class_type === 'LTXVSeparateAVLatent'), false);
  assert.equal(Object.values(g).some(n => n.class_type === 'LTXVConcatAVLatent'), false);
});

test('refine enabled: inserts 3D latent upscaler and low-denoise 2nd-pass resampling', () => {
  const spec = { mode: 'text', token: '001122334455', refine: true, seed: 42 };
  const g = buildGraph(spec, {}, {refine_ready:true});

  const sepNodeEntry = Object.entries(g).find(([id, n]) => n.class_type === 'LTXVSeparateAVLatent');
  assert.ok(sepNodeEntry, 'LTXVSeparateAVLatent must exist');
  const [sepId, sepNode] = sepNodeEntry;
  assert.deepEqual(sepNode.inputs.av_latent, ["8", 0]);

  const upEntry = Object.entries(g).find(([id, n]) => n.class_type === 'MinimaxH3LatentUpscaler3D');
  assert.ok(upEntry, 'MinimaxH3LatentUpscaler3D must exist');
  const [upId, upNode] = upEntry;
  assert.deepEqual(upNode.inputs.latent, [sepId, 0]);
  assert.equal(upNode.inputs.model_name, "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors");
  assert.equal(upNode.inputs.mode, "scale by multiplier");
  assert.equal(upNode.inputs["mode.scale"], 1.25);
  assert.equal(upNode.inputs.device, "cuda");
  assert.equal(upNode.inputs.precision, "fp16");

  const concatEntry = Object.entries(g).find(([id, n]) => n.class_type === 'LTXVConcatAVLatent');
  assert.ok(concatEntry, 'LTXVConcatAVLatent must exist');
  const [concatId, concatNode] = concatEntry;
  assert.deepEqual(concatNode.inputs.video_latent, [upId, 0]);
  assert.deepEqual(concatNode.inputs.audio_latent, [sepId, 1]);

  const refineSamplerEntry = Object.entries(g).find(([id, n]) => n.class_type === 'KSampler' && id !== "8");
  assert.ok(refineSamplerEntry, 'Pass 2 KSampler must exist');
  const [refineId, refineNode] = refineSamplerEntry;
  assert.deepEqual(refineNode.inputs.latent_image, [concatId, 0]);
  assert.equal(refineNode.inputs.steps, 10);
  assert.equal(refineNode.inputs.denoise, 0.4);
  assert.equal(refineNode.inputs.cfg, 1);
  assert.equal(refineNode.inputs.sampler_name, "res_multistep");
  assert.equal(refineNode.inputs.scheduler, "simple");
  assert.deepEqual(refineNode.inputs.model, g["8"].inputs.model);
  assert.deepEqual(refineNode.inputs.positive, g["8"].inputs.positive);
  assert.deepEqual(refineNode.inputs.negative, g["8"].inputs.negative);

  // Node 13 receives the refine sampler output
  assert.deepEqual(g["13"].inputs.samples, [refineId, 0]);
});

test('refine enabled with LoRA reuses active LoRA chain in both passes', () => {
  const spec = {
    mode: 'text',
    token: '001122334455',
    refine: true,
    loras: [{ name: 'H3_Combat_V2.safetensors', strength: 0.8, enabled: true }]
  };
  const g = buildGraph(spec, {}, {refine_ready:true});
  const loraNodeEntry = Object.entries(g).find(([id, n]) => n.class_type === 'LoraLoaderModelOnly');
  assert.ok(loraNodeEntry, 'LoRA loader must exist');
  const [loraId, loraNode] = loraNodeEntry;
  assert.equal(loraNode.inputs.lora_name, 'H3_Combat_V2.safetensors');

  const refineSampler = Object.values(g).find(n => n.class_type === 'KSampler' && n.inputs.denoise === 0.4);
  assert.ok(refineSampler);
  assert.deepEqual(g["8"].inputs.model, refineSampler.inputs.model);
});
