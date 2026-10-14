/**
 * H3 Studio Lab — Deterministic Graph Builder
 *
 * Constructs ComfyUI workflow graphs for Text, Frames, References, Temporal Guides,
 * and AV Continuation without reading DOM state.
 *
 * Guarantees:
 * - Deterministic node IDs and link mappings.
 * - Links first_frame to node 15 and last_frame to node 16 (never colliding with 13).
 * - Exact video index alignment for paired ref_video_audio soundtracks.
 * - Chaining native AddGuide nodes when temporal guides are specified.
 * - Integration with GeneratedAVMaskedContext and ExistingVideoMaskedContext.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./configuration.js'),require('./render-values.js'));
  } else {
    root.H3GraphBuilder = factory(root.H3Configuration,root.H3RenderValues);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Configuration, RenderValues) {
  'use strict';

  const MODEL_FL = "minimax_h3_fl2va_pruned_int8_convrot.safetensors";
  const MODEL_REF = "minimax_h3_ref2va_pruned_int8_convrot.safetensors";

  // 1080p is an output size, not a valid native H3 sampling height.
  function canvasFor(width, height) {
    width = Number(width); height = Number(height);
    const exact1080 = width === 1920 && height === 1080 || width === 1080 && height === 1920;
    if (![width, height].every(n => Number.isInteger(n) && n >= 32 && n <= 8192)
      || !exact1080 && [width, height].some(n => n % 32 !== 0)) throw new Error('Canvas dimensions must be positive multiples of 32, or the exact 1920x1080 / 1080x1920 output presets.');
    const samplingWidth = exact1080 ? Math.ceil(width / 32) * 32 : width;
    const samplingHeight = exact1080 ? Math.ceil(height / 32) * 32 : height;
    return {width: samplingWidth, height: samplingHeight, outputWidth: width, outputHeight: height,
      crop: exact1080 ? {width, height, x: (samplingWidth-width)/2, y: (samplingHeight-height)/2} : null};
  }

  const own = (object, key) => key != null && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
  function canonicalFile(file, label='asset') {
    if (file == null) return file;
    if (typeof file !== 'string' || !file || file.includes('..') || /[\\\x00-\x1f]/.test(file) || file.startsWith('/') || /^[a-z]+:/i.test(file)) throw new Error('Invalid canonical '+label+' filename.');
    return file;
  }
  function resolvedFile(assets, ...keys) {
    for (const key of keys) {
      const file = own(assets, key);
      if (file != null) return canonicalFile(file);
    }
  }

  function buildGraph(renderSpec, resolvedAssets = {}, capabilities = {}) {
    const config = Configuration.resolve(renderSpec, capabilities);
    const mode = renderSpec.mode || 'text';
    const isRefs = mode === 'refs';
    const token = renderSpec.token || '000000000000';
    const prompt = renderSpec.compiled_prompt || '';
    const canvas = canvasFor(renderSpec.width ?? 1280, renderSpec.height ?? 704);
    const {width, height} = canvas;
    if (Math.max(width,height)>1920 || width * height > 1920 * 1088) throw new Error('This server supports native H3 canvases up to 1920x1088. Choose a supported canvas.');
    const seconds = Number(renderSpec.target_seconds ?? renderSpec.duration_seconds ?? 124 / 24);
    const length = Number(renderSpec.target_frames ?? (5 + 17 * Math.round((seconds * 24 - 5) / 17)));
    const seed = RenderValues.seed(renderSpec.seed ?? 42);
    if (renderSpec.fps != null && Number(renderSpec.fps) !== 24) throw new Error("H3 requires 24 fps.");
    if (!["text", "frames", "refs"].includes(mode)) throw new Error("Unknown generation mode.");
    if (!Number.isInteger(length) || length < 5 || length > 3600 || (length - 5) % 17 !== 0) throw new Error("Target frames must follow the H3 5 + 17k grid.");
    if (length > 362) throw new Error('This server supports clips up to 362 frames. Use a shorter clip or continuation.');
    const contextLength = Number(renderSpec.continuation?.context_length ?? 39);
    if (renderSpec.continuation) {
      const cont = renderSpec.continuation;
      if(mode==='frames')throw new Error("Continuation uses protected source context; use timed guides instead of start/end frames.");
      const sourceWidth = cont.type === 'generated' ? width : canvas.outputWidth;
      const sourceHeight = cont.type === 'generated' ? height : canvas.outputHeight;
      if(cont.source_canvas&&(Number(cont.source_canvas.width)!==sourceWidth||Number(cont.source_canvas.height)!==sourceHeight))throw new Error("Continuation canvas must match its source.");
      if(cont.type==='generated'&&cont.source_model&&cont.source_model!==config.checkpoint)throw new Error("Changing the continuation checkpoint requires the explicit video re-encode path.");
      if (!["generated", "imported"].includes(cont.type)) throw new Error("Unknown continuation type.");
      if (!(cont.type === "generated" ? cont.source_token : cont.source_file)) throw new Error("Continuation source is missing.");
      if (!Number.isInteger(contextLength) || contextLength < 39 || (contextLength - 39) % 51 !== 0 || contextLength >= length) throw new Error("Continuation context must be an exact shared AV boundary shorter than the target.");
      if (capabilities.continuation_ready !== true) throw new Error("AV continuation is unavailable: verified durable context loading and frame/sample-exact trimming and assembly are required before rendering.");
    }
    const enableRefine = !!(renderSpec.enable_refine ?? renderSpec.refine);
    if (enableRefine && capabilities.refine_ready !== true) throw new Error('Latent refine is unavailable: verified nodes and upscaler weights are required.');
    if (enableRefine && renderSpec.continuation) throw new Error('Refine cannot be combined with continuation.');
    const control = renderSpec.control?.enabled ? renderSpec.control : null;
    if (control) {
      if (capabilities.controlnet_ready !== true) throw new Error('ControlNet is unavailable: verified native nodes and model patch weights are required.');
      if (renderSpec.continuation || enableRefine) throw new Error('ControlNet with continuation or refine has not been validated.');
      if (isRefs && capabilities.controlnet_references_ready !== true) throw new Error('References with ControlNet require the verified ComfyUI PR #16020 implementation.');
      if (!['pose','depth','canny','hed','mlsd','scribble','layout','gray','inpaint'].includes(control.kind)) throw new Error('Unknown prepared control kind.');
      if (control.model_name !== 'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors') throw new Error('Unknown ControlNet model patch.');
      if (Number(control.fps) !== 24 || Number(control.frame_count) !== length || Number(control.width) !== width || Number(control.height) !== height) throw new Error('Prepared control metadata must match 24 fps, target frames and canvas exactly.');
      if ((control.mask_file || own(resolvedAssets,'mask')) && control.kind !== 'inpaint') throw new Error('A mask requires explicit inpaint control kind.');
      if ((control.source_file || own(resolvedAssets,'source')) && !(control.mask_file || own(resolvedAssets,'mask'))) throw new Error('Control source requires a mask.');
      for (const [key, fallback, min, max] of [['strength',1,0,10],['start_percent',0,0,1],['end_percent',1,0,1]]) {
        const value = Number(control[key] ?? fallback);
        if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid control ' + key + '.');
      }
      if (Number(control.start_percent ?? 0) >= Number(control.end_percent ?? 1)) throw new Error('Control start must precede its end.');
    }
    const steps = Number(renderSpec.steps ?? 20);
    if (!Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('Steps must be an integer between 1 and 100.');
    const method = renderSpec.render_method || 'native';
    if (!['native','spectrum','motioncache'].includes(method)) throw new Error('Unknown render method.');
    if (enableRefine && (!Number.isFinite(Number(renderSpec.refine_scale ?? 1.25)) || Number(renderSpec.refine_scale ?? 1.25) < 1 || Number(renderSpec.refine_scale ?? 1.25) > 1.25)) throw new Error('This server supports refinement up to 1.25x.');
    const refinement={steps:10,denoise:.4,cfg:1,sampler_name:'res_multistep',scheduler:'simple',...renderSpec.refinement};
    if(enableRefine){
      if(!Number.isInteger(refinement.steps)||refinement.steps<1||refinement.steps>100||!Number.isFinite(refinement.denoise)||refinement.denoise<0||refinement.denoise>1||!Number.isFinite(refinement.cfg)||refinement.cfg<0||refinement.cfg>100)throw Error('Invalid refinement sampling settings.');
      Configuration.resolve({...renderSpec,sampling:{...renderSpec.sampling,sampler_name:refinement.sampler_name,scheduler:refinement.scheduler}},capabilities);
    }

    const g = {
      "1": { class_type: config.loader, inputs: config.loader === 'UnetLoaderGGUF' ? {unet_name:config.checkpoint} : {unet_name:config.checkpoint,weight_dtype:config.settings.weight_dtype} },
      "2": { class_type: "MiniMaxH3SigmaShift", inputs: { model: ["1", 0], shift_video: config.settings.shift_video, shift_audio: config.settings.shift_audio } },
      "3": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax" } },
      "4": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" } },
      "5": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" } },
      "6": {
        class_type: isRefs ? "MiniMaxH3ReferenceToVideo" : "MiniMaxH3ImageToVideo",
        inputs: {
          clip: ["3", 0],
          vae: ["4", 0],
          prompt: prompt,
          width: width,
          height: height,
          length: length,
        }
      },
      "7": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["6", 0] } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["2", 0],
          seed: seed,
          steps: steps,
          cfg: config.settings.cfg,
          sampler_name: config.settings.sampler_name,
          scheduler: config.settings.scheduler,
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["6", 1],
          denoise: config.settings.denoise
        }
      },
      "13": { class_type: "H3ReleaseForDecode", inputs: { samples: ["8", 0], token: token } },
      "9": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["4", 0] } },
      "10": { class_type: "VAEDecodeAudio", inputs: { samples: ["13", 0], vae: ["5", 0] } },
      "11": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: 24, audio: ["10", 0] } },
      "12": { class_type: "H3SaveVideo", inputs: { video: ["11", 0], filename_prefix: "video/h3_studio_" + token } },
    };
    if(config.profile==='hybrid_loader')g['1']={class_type:'MinimaxH3_HybridLoader',inputs:{base_model:MODEL_FL,overlay_model:config.hybrid_preset==='none'?'':MODEL_REF,overlay_preset:config.hybrid_preset}};

    const allocate = (start) => { let id = start; while (g[String(id)]) id++; return String(id); };

    // LoRA chain
    let modelLink = ["1", 0];
    const loras = (renderSpec.loras || []).filter(l => l.enabled);
    loras.forEach((lora, idx) => {
      if (!lora.name || !Number.isFinite(Number(lora.strength ?? 1)) || !Number.isFinite(Number(lora.refinement_strength ?? 1))) throw new Error('Invalid LoRA name or strength.');
      const loraId = allocate(50);
      g[loraId] = {
        class_type: "LoraLoaderModelOnly",
        inputs: { model: modelLink, lora_name: lora.name, strength_model: Number(lora.strength ?? 1.0) }
      };
      modelLink = [loraId, 0];
    });

    g["2"].inputs.model = modelLink;
    let samplingModelLink = ["2", 0];
    if (control) {
      const controlFile = (key) => canonicalFile(resolvedFile(resolvedAssets, key) ?? control[key + '_file'], 'control');
      const loadVideoImages = file => {
        const loadId = allocate(110); g[loadId] = {class_type:'LoadVideo',inputs:{file}};
        const splitId = allocate(110); g[splitId] = {class_type:'GetVideoComponents',inputs:{video:[loadId,0]}};
        return [splitId,0];
      };
      const file = controlFile('control');
      const mask = controlFile('mask'), source = controlFile('source');
      if (!file && !(control.kind === 'inpaint' && mask && source)) throw new Error('Prepared control video or an inpaint source and mask has not been resolved.');
      const patchId = allocate(110); g[patchId] = {class_type:'ModelPatchLoader',inputs:{name:control.model_name}};
      const inputs = {model:samplingModelLink,model_patch:[patchId,0],vae:['4',0],strength:Number(control.strength ?? 1),start_percent:Number(control.start_percent ?? 0),end_percent:Number(control.end_percent ?? 1)};
      if (file) inputs.control_video = loadVideoImages(file);
      if (mask) {
        const imageId = allocate(110); g[imageId] = {class_type:'LoadImage',inputs:{image:mask}};
        const maskId = allocate(110); g[maskId] = {class_type:'ImageToMask',inputs:{image:[imageId,0],channel:'red'}};
        inputs.mask = [maskId,0];
      }
      if (source) inputs.source_video = loadVideoImages(source);
      const applyId = allocate(110); g[applyId] = {class_type:'MiniMaxH3FunControlNetApply',inputs};
      samplingModelLink = [applyId,0];
    }
    g["8"].inputs.model = samplingModelLink;

    if (method === "spectrum") {
      const methodId = allocate(61);
      g[methodId] = {
        class_type: "SpectrumApplyMiniMaxH3",
        inputs: {
          model: samplingModelLink, enabled: true, blend_weight: 0.5, degree: 1, ridge_lambda: 0.1,
          window_size: 2, flex_window: 0.75, warmup_steps: 1, tail_actual_steps: 1,
          max_history: 2, debug: false, history_storage: "system_ram",
          offline_archive_storage: "system_ram", audio_blend_weight: 0, offline_smoothing_replay: false
        }
      };
      g["8"].inputs.model = [methodId, 0];
    } else if (method === "motioncache") {
      const methodId = allocate(61);
      g[methodId] = {
        class_type: "MiniMaxH3MotionCache",
        inputs: {
          model: samplingModelLink, reuse_threshold: 0.15, motion_strength: 1, warmup_steps: 4,
          max_consecutive_skips: 2, start_percent: 0.15, end_percent: 0.95,
          subsample_factor: 8, verbose: false
        }
      };
      g["8"].inputs.model = [methodId, 0];
    }

    // Frames mode inputs
    if (mode === 'frames') {
      const frames = renderSpec.frames || {};
      const first = resolvedFile(resolvedAssets, 'first', frames.first);
      const last = resolvedFile(resolvedAssets, 'last', frames.last);
      if ((frames.first && !first) || (frames.last && !last)) throw new Error('A selected frame has not been resolved.');
      if (!first && !last) throw new Error('Frames mode requires a resolved start or end image.');
      if (first) {
        g["15"] = { class_type: "LoadImage", inputs: { image: first } };
        g["6"].inputs.first_frame = ["15", 0];
      }
      if (last) {
        g["16"] = { class_type: "LoadImage", inputs: { image: last } };
        g["6"].inputs.last_frame = ["16", 0];
      }
    }

    // References mode inputs
    if (isRefs) {
      g["6"].inputs.audio_vae = ["5", 0];
      g["6"].inputs.ref_image_size = renderSpec.ref_image_size || "match";

      let nextNodeId = 20;
      let imgSlot = 0;
      let vidSlot = 0;
      let audSlot = 0;

      const refs = renderSpec.references || [];
      if (!refs.length) throw new Error('References mode requires at least one reference.');
      if (refs.some(ref => !['image', 'video', 'audio'].includes(ref.kind))) throw new Error('Unknown reference kind.');
      const ordered = ['image', 'video', 'audio'].flatMap(kind => refs.filter(ref => ref.kind === kind));
      for (const ref of ordered) {
        // A card's prepared fit is distinct even when cards share a saved asset.
        const file = resolvedFile(resolvedAssets, ref.alias, ref.asset_id);
        if (!file) throw new Error(`Reference ${ref.alias || ref.asset_id} has not been resolved.`);

        if (ref.kind === 'image') {
          const loadId = allocate(nextNodeId++);
          g[loadId] = { class_type: "LoadImage", inputs: { image: file } };
          g["6"].inputs[`ref_images.ref_image_${imgSlot++}`] = [loadId, 0];
        } else if (ref.kind === 'video') {
          const loadId = allocate(nextNodeId++);
          const splitId = allocate(nextNodeId++);
          const frames = Number(ref.frame_count ?? ref.duration_frames);
          if (Number(ref.fps) !== 24 || !Number.isInteger(frames) || frames < 5) throw new Error('Reference video requires verified 24 fps and a frame count of at least 5.');
          const used = 5 + 17 * Math.floor((Math.min(frames, length) - 5) / 17);
          const currentSlot = vidSlot++;
          g[loadId] = { class_type: "LoadVideo", inputs: { file: file } };
          g[splitId] = { class_type: "GetVideoComponents", inputs: { video: [loadId, 0] } };
          const cropId = allocate(nextNodeId++);
          g[cropId] = {class_type:'ImageFromBatch',inputs:{image:[splitId,0],batch_index:0,length:used}};
          g["6"].inputs[`ref_videos.ref_video_${currentSlot}`] = [cropId, 0];
          if (ref.use_audio) {
            const audioId = allocate(nextNodeId++);
            g[audioId] = {class_type:'TrimAudioDuration',inputs:{audio:[splitId,1],start_index:0,duration:used/24}};
            g["6"].inputs[`ref_video_audios.ref_video_audio_${currentSlot}`] = [audioId, 0];
            if(renderSpec.preserve_reference_audio === (ref.asset_id||ref.alias)) {
              if(renderSpec.continuation)throw Error('Source soundtrack reuse with continuation has not been validated.');
              if(used!==length)throw Error('Source soundtrack must cover the full output duration; choose a shorter output.');
              g['11'].inputs.audio=[audioId,0];
            }
          }
        } else if (ref.kind === 'audio') {
          const loadId = allocate(nextNodeId++);
          g[loadId] = { class_type: "LoadAudio", inputs: { audio: file } };
          g["6"].inputs[`ref_audios.ref_audio_${audSlot++}`] = [loadId, 0];
        }
      }
      if(renderSpec.preserve_reference_audio&&!ordered.some(ref=>ref.kind==='video'&&ref.use_audio&&(ref.asset_id||ref.alias)===renderSpec.preserve_reference_audio))throw Error('Select a source video with its soundtrack enabled before reusing audio.');
    }
    if(renderSpec.preserve_reference_audio&&!isRefs)throw Error('Source soundtrack reuse requires References mode.');

    // Native temporal guides (MiniMaxH3AddGuide)
    let currentPositive = ["6", 0];
    const guides = renderSpec.guides || [];
    if (guides.length > 0) {
      guides.forEach((guide, gIdx) => {
        const guideNodeId = allocate(70);
        const guideImgNodeId = allocate(Number(guideNodeId) + 1);
        const guideFile = canonicalFile(resolvedFile(resolvedAssets, guide.alias, guide.asset_id) ?? guide.file ?? guide.filename);
        if (!guideFile) throw new Error('Temporal guide image has not been resolved.');
        if (typeof guide.frame_idx !== 'number' || !Number.isInteger(guide.frame_idx)) throw new Error('Temporal guide frame index must be an integer.');
        const frameIdx = guide.frame_idx + (guide.relative_to_new_content && renderSpec.continuation ? contextLength : 0);
        if (frameIdx < 0 || frameIdx >= length) throw new Error('Temporal guide frame index is outside the target timeline.');

        const kind = guide.kind || 'image';
        if (!['image', 'audio', 'video'].includes(kind)) throw new Error('Unknown temporal guide kind.');
        const guideInputs = { positive: currentPositive, latent: ['6', 1], frame_idx: frameIdx };
        if (kind === 'audio') {
          if (capabilities.guide_audio !== true) throw new Error('Native timed audio guides are unavailable on this server.');
          g[guideImgNodeId] = { class_type: 'LoadAudio', inputs: { audio: guideFile } };
          guideInputs.audio = [guideImgNodeId, 0];
          guideInputs.audio_vae = ['5', 0];
        } else if (kind === 'video') {
          if (capabilities.guide_video !== true) throw new Error('Native timed video guides are unavailable on this server.');
          if (Number(guide.fps) !== 24) throw new Error('Video guide must have verified canonical 24 fps metadata.');
          const sourceFrames = Number(guide.frame_count ?? guide.duration_frames);
          if (!Number.isInteger(sourceFrames) || sourceFrames < 1) throw new Error('Video guide requires a verified frame count.');
          const span = sourceFrames < 5 ? 1 : 5 + 17 * Math.floor((sourceFrames - 5) / 17);
          if (frameIdx + span > length) throw new Error('Video guide extends past the target timeline.');
          if (guide.use_audio && capabilities.guide_audio !== true) throw new Error('Native timed video audio guides are unavailable on this server.');
          g[guideImgNodeId] = { class_type: 'LoadVideo', inputs: { file: guideFile } };
          const splitId = allocate(Number(guideImgNodeId) + 1);
          g[splitId] = { class_type: 'GetVideoComponents', inputs: { video: [guideImgNodeId, 0] } };
          guideInputs.image = [splitId, 0];
          guideInputs.vae = ['4', 0];
          if (guide.use_audio) {
            guideInputs.audio = [splitId, 1];
            guideInputs.audio_vae = ['5', 0];
          }
        } else {
          g[guideImgNodeId] = { class_type: 'LoadImage', inputs: { image: guideFile } };
          guideInputs.vae = ['4', 0];
          guideInputs.image = [guideImgNodeId, 0];
        }
        g[guideNodeId] = { class_type: 'MiniMaxH3AddGuide', inputs: guideInputs };
        currentPositive = [guideNodeId, 0];
      });
      g["8"].inputs.positive = currentPositive;
    }

    if (renderSpec.continuation) {
      const cont = renderSpec.continuation;
      const contextId = allocate(85);
      const sourceId = allocate(Number(contextId) + 1);
      if (cont.type === 'generated') {
        g[sourceId] = { class_type: 'H3LabLoadContext', inputs: { token: cont.source_token, model_id: config.checkpoint, width, height, fps: 24 } };
        g[contextId] = { class_type: 'MiniMaxH3GeneratedAVMaskedContext', inputs: { latent: ['6', 1], source_latent: [sourceId, 0], context_length: contextLength, audio_feather_ticks: Number(cont.audio_feather_ticks ?? 8) } };
      } else {
        g[sourceId] = { class_type: 'LoadVideo', inputs: { file: canonicalFile(cont.source_file) } };
        const splitId = allocate(Number(sourceId) + 1);
        g[splitId] = { class_type: 'GetVideoComponents', inputs: { video: [sourceId, 0] } };
        g[contextId] = { class_type: 'MiniMaxH3ExistingVideoMaskedContext', inputs: { latent: ['6', 1], vae: ['4', 0], audio_vae: ['5', 0], source_frames: [splitId, 0], source_audio: [splitId, 1], source_fps: 24, context_length: contextLength, crop: 'disabled', audio_feather_ticks: Number(cont.audio_feather_ticks ?? 8) } };
      }
      g['8'].inputs.latent_image = [contextId, 0];
      const trimId = allocate(90);
      g[trimId] = { class_type: 'H3LabTrimAV', inputs: { images: ['9', 0], audio: ['10', 0], trim_frames: [contextId, 1], fps: 24 } };
      g['11'].inputs.images = [trimId, 0];
      g['11'].inputs.audio = [trimId, 1];
    }


    if (enableRefine) {
      let refinementModel = g['8'].inputs.model;
      if (loras.some(l => l.refinement_strength != null || /Motion[_ -]Repair[_ -]V2/i.test(l.name))) {
        let stageLink = ['1',0];
        for (const lora of loras) {
          const id = allocate(150);
          g[id] = {class_type:'LoraLoaderModelOnly',inputs:{model:stageLink,lora_name:lora.name,strength_model:Number(lora.refinement_strength ?? (/Motion[_ -]Repair[_ -]V2/i.test(lora.name) ? .25 : lora.strength ?? 1))}};
          stageLink = [id,0];
        }
        const shiftId = allocate(150);g[shiftId]={class_type:'MiniMaxH3SigmaShift',inputs:{model:stageLink,shift_video:config.settings.shift_video,shift_audio:config.settings.shift_audio}};
        refinementModel = [shiftId,0];
      }
      const separateId = allocate(100);
      const upscaleId = allocate(Number(separateId) + 1);
      const concatId = allocate(Number(upscaleId) + 1);
      const refineSamplerId = allocate(Number(concatId) + 1);

      g[separateId] = {
        class_type: "LTXVSeparateAVLatent",
        inputs: {
          av_latent: ["8", 0]
        }
      };

      g[upscaleId] = {
        class_type: "MinimaxH3LatentUpscaler3D",
        inputs: {
          latent: [separateId, 0],
          model_name: "minimax_h3_latent_upscaler_3d_conv_v1_fp16.safetensors",
          mode: "scale by multiplier",
          "mode.scale": Number(renderSpec.refine_scale ?? 1.25),
          align: 32,
          enable_temporal_chunking: true,
          force_unload: true,
          device: "cuda",
          precision: "fp16"
        }
      };

      g[concatId] = {
        class_type: "LTXVConcatAVLatent",
        inputs: {
          video_latent: [upscaleId, 0],
          audio_latent: [separateId, 1]
        }
      };

      g[refineSamplerId] = {
        class_type: "KSampler",
        inputs: {
          model: refinementModel,
          seed: RenderValues.nextSeed(seed),
          steps: refinement.steps,
          cfg: refinement.cfg,
          sampler_name: refinement.sampler_name,
          scheduler: refinement.scheduler,
          positive: g["8"].inputs.positive,
          negative: g["8"].inputs.negative,
          latent_image: [concatId, 0],
          denoise: refinement.denoise
        }
      };

      g["13"].inputs.samples = [refineSamplerId, 0];
    }

    // Native ComfyUI nodes, verified against pinned revision 3b4c0b0e.
    // Fit refinement back to these new selected outputs; legacy refine stays unchanged.
    if (enableRefine && (canvas.crop || width === 1664 && height === 928)) {
      const fitId = allocate(170);
      g[fitId] = {class_type:'ImageScale',inputs:{image:g['11'].inputs.images,upscale_method:'lanczos',width,height,crop:'center'}};
      g['11'].inputs.images = [fitId,0];
    }
    // This spatial crop follows AV continuation trim and precedes video assembly.
    if (canvas.crop) {
      const cropId = allocate(170);
      g[cropId] = {class_type:'ImageCrop',inputs:{image:g['11'].inputs.images,...canvas.crop}};
      g['11'].inputs.images = [cropId,0];
    }
    for(const node of Object.values(g))if(['SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache'].includes(node.class_type))Configuration.patchOptions(node,renderSpec.node_options?.[node.class_type],capabilities);
    return g;
  }

  return {
    buildGraph,
    canvasFor,
  };
});
