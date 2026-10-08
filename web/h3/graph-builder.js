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
    module.exports = factory();
  } else {
    root.H3GraphBuilder = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const MODEL_FL = "minimax_h3_fl2va_pruned_int8_convrot.safetensors";
  const MODEL_REF = "minimax_h3_ref2va_pruned_int8_convrot.safetensors";
  const TURBO_NAME = "experimental/minimax_h3_fl2v_lightx2v_turbo_4to8step_v0.1-v1.0_768p_v4_step600_dareties.safetensors";

  function buildGraph(renderSpec, resolvedAssets = {}, capabilities = {}) {
    const mode = renderSpec.mode || 'text';
    const isRefs = mode === 'refs';
    const token = renderSpec.token || '000000000000';
    const prompt = renderSpec.compiled_prompt || '';
    const width = Number(renderSpec.width ?? 1280);
    const height = Number(renderSpec.height ?? 704);
    const seconds = Number(renderSpec.target_seconds ?? renderSpec.duration_seconds ?? 124 / 24);
    const length = Number(renderSpec.target_frames ?? (5 + 17 * Math.round((seconds * 24 - 5) / 17)));
    const seed = Number(renderSpec.seed ?? 42);
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Seed must be a nonnegative safe integer.");
    if (renderSpec.fps != null && Number(renderSpec.fps) !== 24) throw new Error("H3 requires 24 fps.");
    if (!["text", "frames", "refs"].includes(mode)) throw new Error("Unknown generation mode.");
    if (!Number.isInteger(length) || length < 5 || length > 3600 || (length - 5) % 17 !== 0) throw new Error("Target frames must follow the H3 5 + 17k grid.");
    const contextLength = Number(renderSpec.continuation?.context_length ?? 39);
    if (renderSpec.continuation) {
      const cont = renderSpec.continuation;
      if(mode==='frames')throw new Error("Continuation uses protected source context; use timed guides instead of start/end frames.");
      if(cont.source_canvas&&(Number(cont.source_canvas.width)!==width||Number(cont.source_canvas.height)!==height))throw new Error("Continuation canvas must match its source.");
      if(cont.type==='generated'&&cont.source_model&&cont.source_model!==(isRefs?MODEL_REF:MODEL_FL))throw new Error("Changing the continuation checkpoint requires the explicit video re-encode path.");
      if (!["generated", "imported"].includes(cont.type)) throw new Error("Unknown continuation type.");
      if (!(cont.type === "generated" ? cont.source_token : cont.source_file)) throw new Error("Continuation source is missing.");
      if (!Number.isInteger(contextLength) || contextLength < 39 || (contextLength - 39) % 51 !== 0 || contextLength >= length) throw new Error("Continuation context must be an exact shared AV boundary shorter than the target.");
      if (capabilities.continuation_ready !== true) throw new Error("AV continuation is unavailable: verified durable context loading and frame/sample-exact trimming and assembly are required before rendering.");
    }
    if (![width, height].every(n => Number.isInteger(n) && n >= 32 && n <= 8192 && n % 32 === 0)) throw new Error('Canvas dimensions must be positive multiples of 32.');
    const enableRefine = !!(renderSpec.enable_refine ?? renderSpec.refine);
    if (enableRefine && capabilities.refine_ready !== true) throw new Error('Latent refine is unavailable: verified nodes and upscaler weights are required.');
    if (enableRefine && renderSpec.continuation) throw new Error('Refine cannot be combined with continuation.');
    const control = renderSpec.control?.enabled ? renderSpec.control : null;
    if (control) {
      if (capabilities.controlnet_ready !== true) throw new Error('ControlNet is unavailable: verified native nodes and model patch weights are required.');
      if (isRefs || renderSpec.continuation || enableRefine) throw new Error('ControlNet requires FL2VA without references, continuation or refine.');
      if (!['pose','depth','canny','hed','mlsd','scribble','layout','gray','inpaint'].includes(control.kind)) throw new Error('Unknown prepared control kind.');
      if (control.model_name !== 'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors') throw new Error('Unknown ControlNet model patch.');
      if (Number(control.fps) !== 24 || Number(control.frame_count) !== length || Number(control.width) !== width || Number(control.height) !== height) throw new Error('Prepared control metadata must match 24 fps, target frames and canvas exactly.');
      if ((control.mask_file || resolvedAssets.mask) && control.kind !== 'inpaint') throw new Error('A mask requires explicit inpaint control kind.');
      if ((control.source_file || resolvedAssets.source) && !(control.mask_file || resolvedAssets.mask)) throw new Error('Control source requires a mask.');
      for (const [key, fallback, min, max] of [['strength',1,0,10],['start_percent',0,0,1],['end_percent',1,0,1]]) {
        const value = Number(control[key] ?? fallback);
        if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid control ' + key + '.');
      }
      if (Number(control.start_percent ?? 0) >= Number(control.end_percent ?? 1)) throw new Error('Control start must precede its end.');
    }
    const steps = Number(renderSpec.steps ?? (renderSpec.render_method === 'turbo' ? 6 : 20));
    if (!Number.isInteger(steps) || steps < 1 || steps > 100) throw new Error('Steps must be an integer between 1 and 100.');
    const method = renderSpec.render_method || 'native';
    if (!['native','turbo','spectrum','motioncache'].includes(method)) throw new Error('Unknown render method.');
    if (isRefs && method === 'turbo') throw new Error('Turbo requires FL2VA.');
    if (enableRefine && (!Number.isFinite(Number(renderSpec.refine_scale ?? 1.25)) || Number(renderSpec.refine_scale ?? 1.25) < 1 || Number(renderSpec.refine_scale ?? 1.25) > 4)) throw new Error('Invalid refine scale.');

    const g = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: isRefs ? MODEL_REF : MODEL_FL, weight_dtype: "default" } },
      "2": { class_type: "MiniMaxH3SigmaShift", inputs: { model: ["1", 0], shift_video: 12, shift_audio: 3 } },
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
          cfg: 1,
          sampler_name: "res_multistep",
          scheduler: "simple",
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["6", 1],
          denoise: 1
        }
      },
      "13": { class_type: "H3ReleaseForDecode", inputs: { samples: ["8", 0], token: token } },
      "9": { class_type: "VAEDecode", inputs: { samples: ["13", 0], vae: ["4", 0] } },
      "10": { class_type: "VAEDecodeAudio", inputs: { samples: ["13", 0], vae: ["5", 0] } },
      "11": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: 24, audio: ["10", 0] } },
      "12": { class_type: "H3SaveVideo", inputs: { video: ["11", 0], filename_prefix: "video/h3_studio_" + token } },
    };

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

    if (method === "turbo" && !isRefs) {
      const turboId = allocate(60);
      g[turboId] = {
        class_type: "LoraLoaderModelOnly",
        inputs: { model: modelLink, lora_name: TURBO_NAME, strength_model: 0.9 }
      };
      modelLink = [turboId, 0];
    }
    g["2"].inputs.model = modelLink;
    let samplingModelLink = ["2", 0];
    if (control) {
      const canonicalFile = (key) => {
        const file = resolvedAssets[key] || control[key + '_file'];
        if (file != null && (typeof file !== 'string' || !file || file.includes('..') || /[\\\x00-\x1f]/.test(file) || file.startsWith('/') || /^[a-z]+:/i.test(file))) throw new Error('Invalid canonical control file.');
        return file;
      };
      const loadVideoImages = file => {
        const loadId = allocate(110); g[loadId] = {class_type:'LoadVideo',inputs:{file}};
        const splitId = allocate(110); g[splitId] = {class_type:'GetVideoComponents',inputs:{video:[loadId,0]}};
        return [splitId,0];
      };
      const file = canonicalFile('control');
      const mask = canonicalFile('mask'), source = canonicalFile('source');
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
          max_history: 8, debug: false, history_storage: "system_ram",
          offline_archive_storage: "system_ram", audio_blend_weight: 0, offline_smoothing_replay: true
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
      const first = resolvedAssets.first || resolvedAssets[frames.first];
      const last = resolvedAssets.last || resolvedAssets[frames.last];
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
        const file = resolvedAssets[ref.asset_id] || resolvedAssets[ref.alias];
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
          }
        } else if (ref.kind === 'audio') {
          const loadId = allocate(nextNodeId++);
          g[loadId] = { class_type: "LoadAudio", inputs: { audio: file } };
          g["6"].inputs[`ref_audios.ref_audio_${audSlot++}`] = [loadId, 0];
        }
      }
    }

    // Native temporal guides (MiniMaxH3AddGuide)
    let currentPositive = ["6", 0];
    const guides = renderSpec.guides || [];
    if (guides.length > 0) {
      guides.forEach((guide, gIdx) => {
        const guideNodeId = allocate(70);
        const guideImgNodeId = allocate(Number(guideNodeId) + 1);
        const guideFile = resolvedAssets[guide.asset_id] || guide.file || guide.filename;
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
        g[sourceId] = { class_type: 'H3LabLoadContext', inputs: { token: cont.source_token, model_id: isRefs ? MODEL_REF : MODEL_FL, width, height, fps: 24 } };
        g[contextId] = { class_type: 'MiniMaxH3GeneratedAVMaskedContext', inputs: { latent: ['6', 1], source_latent: [sourceId, 0], context_length: contextLength, audio_feather_ticks: Number(cont.audio_feather_ticks ?? 8) } };
      } else {
        g[sourceId] = { class_type: 'LoadVideo', inputs: { file: cont.source_file } };
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
        if (method === 'turbo') {const id = allocate(150);g[id]={class_type:'LoraLoaderModelOnly',inputs:{model:stageLink,lora_name:TURBO_NAME,strength_model:.9}};stageLink=[id,0];}
        const shiftId = allocate(150);g[shiftId]={class_type:'MiniMaxH3SigmaShift',inputs:{model:stageLink,shift_video:12,shift_audio:3}};
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
          seed: (seed + 1) > 18446744073709551615 ? seed : (seed + 1),
          steps: 10,
          cfg: 1,
          sampler_name: "res_multistep",
          scheduler: "simple",
          positive: g["8"].inputs.positive,
          negative: g["8"].inputs.negative,
          latent_image: [concatId, 0],
          denoise: 0.4
        }
      };

      g["13"].inputs.samples = [refineSamplerId, 0];
    }

    return g;
  }

  return {
    buildGraph,
  };
});
