/* Shared configuration contract: the studio and graph builder resolve the same values. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.H3Configuration=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FL='minimax_h3_fl2va_pruned_int8_convrot.safetensors', REF='minimax_h3_ref2va_pruned_int8_convrot.safetensors';
  const defaults=Object.freeze({sampler_name:'res_multistep',scheduler:'simple',cfg:1,denoise:1,shift_video:12,shift_audio:3,weight_dtype:'default'});
  const profiles=Object.freeze({original:{label:'Original H3',accent:'original'},singularity:{label:'H3 Singularity',accent:'singularity'},hybrid_conditioning:{label:'Hybrid · FL2VA reference conditioning',accent:'hybrid'},hybrid_loader:{label:'Hybrid · tensor overlay loader',accent:'hybrid'}});
  function filename(value){if(typeof value!=='string'||!value||value.includes('..')||/[\\\x00-\x1f]/.test(value)||value.startsWith('/')||/^[a-z]+:/i.test(value))throw Error('Invalid model filename.');return value;}
  const TURBO_REF='minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors';
  const TURBO='minimax_h3_turbo_v4_step600_ema.safetensors';
  const CHARACTER_SWAP='h3_character_swap_pro4500_1000.safetensors';
  const ANIME_TO_REALISM='Anime2Realsim__H3.safetensors';
  function isAnimeToRealism(name){return String(name||'').split(/[\\/]/).pop().toLowerCase()===ANIME_TO_REALISM.toLowerCase();}
  function validateAnimeToRealism(spec){
    if(!(spec.loras||[]).some(x=>x.enabled&&isAnimeToRealism(x.name)))return;
    if(spec.mode!=='refs')throw Error('Anime → Realism requires Ref2VA reference conditioning.');
    if(!(spec.references||[]).some(r=>r.kind==='video'))throw Error('Anime → Realism requires a source video in References.');
  }
  function isCharacterSwap(name){return String(name||'').split(/[\\/]/).pop().toLowerCase()===CHARACTER_SWAP;}
  function validateCharacterSwap(spec){
    if(!(spec.loras||[]).some(x=>x.enabled&&isCharacterSwap(x.name)))return;
    if(spec.mode!=='refs')throw Error('Character Swap requires Ref2VA reference conditioning.');
    const refs=spec.references||[];
    if(!refs.some(r=>r.kind==='video')||!refs.some(r=>r.kind==='image'))throw Error('Character Swap requires a source video and replacement character image in References.');
  }
  function resolve(spec,caps={}){
    if((spec.loras||[]).some(x=>x.enabled&&/^qwen21[\\/]/i.test(x.name||'')))throw Error('Qwen Image adapters belong in Create Image, not H3 video.');
    validateCharacterSwap(spec);
    validateAnimeToRealism(spec);
    const profile=spec.model_profile||'original';if(!profiles[profile])throw Error('Unknown model profile.');
    const family=spec.mode==='refs'?'ref2va':'fl2va';
    let name=profile==='original'?(family==='ref2va'?REF:FL):profile==='singularity'?filename(spec.checkpoint):FL;
    let loader='UNETLoader';
    if(profile!=='original'){
      const choices=caps.model_catalog||[];
      const entry=choices.find(x=>x.name===name&&x.profiles?.includes(profile));
      if(!entry)throw Error('Selected checkpoint is unavailable or not registered for this profile.');
      loader=entry.loader||loader;
      if(profile==='hybrid_loader'&&!caps.hybrid_loader_ready)throw Error('Install the compatible MinimaxH3_HybridLoader node before using tensor overlays.');
    }
    const turbo=spec.render_method==='turbo'||spec.render_method==='turbo_ref';
    const turboRef=spec.render_method==='turbo_ref';
    if((spec.loras||[]).some(x=>x.enabled&&/turbo|lightx2v/i.test(x.name)))throw Error('Select Turbo v4 from Render method; standalone Turbo adapters are unsupported.');
    if(turbo){
      if(!(turboRef?caps.turbo_ref_ready:caps.turbo_ready))throw Error('Turbo weight and required nodes are required.');
      if(profile!=='original'||(turboRef?spec.mode!=='refs':spec.mode==='refs'))throw Error('Select the Turbo version matching Original Text/Frames or References.');
      if((spec.loras||[]).some(x=>x.enabled)||spec.enable_refine||spec.refine||spec.control?.enabled||spec.continuation||spec.audio_refinement?.enabled)throw Error('Turbo v4 requires a single generation pass without other adapters, refinement, ControlNet or continuation.');
    }
    const settings={...defaults,...spec.sampling,...(turbo?{sampler_name:turboRef?'euler':'h3_turbo',scheduler:'simple',cfg:1,denoise:1,shift_video:12,shift_audio:3}:{})};
    if(!turbo&&settings.sampler_name==='h3_turbo')throw Error('The H3 Turbo sampler requires the Turbo v4 render method.');
    const ranges={cfg:[0,100],denoise:[0,1],shift_video:[0,100],shift_audio:[0,100]};
    for(const [key,[min,max]] of Object.entries(ranges)){settings[key]=Number(settings[key]);if(!Number.isFinite(settings[key])||settings[key]<min||settings[key]>max)throw Error('Invalid '+key+'.');}
    const lists={sampler_name:caps.sampling_options?.samplers||['res_multistep'],scheduler:caps.sampling_options?.schedulers||['simple'],weight_dtype:caps.sampling_options?.weight_dtypes||['default']};
    for(const [key,values] of Object.entries(lists))if(!values.includes(settings[key]))throw Error('Selected '+key+' is not supported by this runtime.');
    if(profile==='hybrid_loader'&&settings.weight_dtype!=='default')throw Error('The hybrid loader preserves the checkpoint precision and does not expose weight_dtype. Select default precision.');
    const preset=spec.hybrid_preset||'none';if(!['none','block_range_adaln','all_adaln'].includes(preset))throw Error('Unknown hybrid overlay preset.');
    if(profile!=='original'&&spec.continuation?.type==='generated'&&spec.continuation.source_model!==name)throw Error('Re-encode the continuation video before changing checkpoints.');
    return {profile,family,checkpoint:name,loader,settings,hybrid_preset:preset,experimental:profile!=='original'};
  }
  // Only scalar widgets declared by the live node schema can override a patch.
  // MODEL/conditioning/media links and unknown inputs cannot be replaced.
  function patchOptions(node,values,caps){
    if(!values||!Object.keys(values).length)return node;
    const schema=caps.node_schemas?.[node.class_type]?.input;
    if(!schema)throw Error('Advanced options require a live schema for '+node.class_type+'.');
    const fields={...schema.required,...schema.optional};
    for(const [key,value] of Object.entries(values)){
      const field=fields[key];if(!field||!(key in node.inputs)||Array.isArray(node.inputs[key]))throw Error('Unsupported advanced input '+key+'.');
      const [type,limits={}]=field;
      if(Array.isArray(type)){if(!type.includes(value))throw Error('Invalid '+key+'.');}
      else if(type==='BOOLEAN'){if(typeof value!=='boolean')throw Error('Invalid '+key+'.');}
      else if(type==='INT'||type==='FLOAT'){if(typeof value!=='number'||!Number.isFinite(value)||(type==='INT'&&!Number.isInteger(value))||value<(limits.min??-Infinity)||value>(limits.max??Infinity))throw Error('Invalid '+key+'.');}
      else throw Error('Only scalar node widgets may be overridden.');
      node.inputs[key]=value;
    }
    return node;
  }
  return {TURBO_REF,TURBO,defaults,profiles,resolve,patchOptions,FL,REF,CHARACTER_SWAP,isCharacterSwap,validateCharacterSwap,ANIME_TO_REALISM,isAnimeToRealism,validateAnimeToRealism};
});
