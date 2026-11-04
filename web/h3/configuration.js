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
  function isCharacterSwap(name){return [CHARACTER_SWAP,'h3_character_swap_v1.5.safetensors'].includes(String(name||'').split(/[\\/]/).pop().toLowerCase());}
  function preferredCharacterSwap(loras){const matches=loras.filter(x=>isCharacterSwap(x.name));return matches.find(x=>x.enabled)||matches.find(x=>String(x.name).endsWith('h3_character_swap_v1.5.safetensors'))||matches[0];}
  function validateCharacterSwap(spec){
    if((spec.loras||[]).filter(x=>x.enabled&&isCharacterSwap(x.name)).length>1)throw Error('Choose one Character Swap version.');
    if(!(spec.loras||[]).some(x=>x.enabled&&isCharacterSwap(x.name)))return;
    if(spec.mode!=='refs')throw Error('Character Swap requires Ref2VA reference conditioning.');
    const refs=spec.references||[];
    if(!refs.some(r=>r.kind==='video')||!refs.some(r=>r.kind==='image'))throw Error('Character Swap requires a source video and replacement character image in References.');
  }
  const PIKA=Object.freeze(Object.fromEntries([
    ...[4,8].flatMap(steps=>['fl2va','ref2va'].map(family=>[`pika_h3_flex_turbo_${steps}step${steps===8?'_hd':''}_${family}.safetensors`,{steps,family,variant:steps===8?'hd':'full'}])),
    ...['fl2va','ref2va'].map(family=>[`pika_h3_flex_turbo_4step_${family}_lite_r32.safetensors`,{steps:4,family,variant:'lite'}]),
    ['pika_h3_flex_turbo_2step_draft_ref2va.safetensors',{steps:2,family:'ref2va',variant:'draft'}]
  ]));
  function pikaVariant(name){return PIKA[name]||null;}
  function pikaProfileCompatible(spec){return (spec.model_profile||'original')==='original'||(spec.model_profile==='singularity'&&spec.mode==='refs'&&String(spec.checkpoint||'').split(/[\\/]/).pop()==='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors');}
  function pikaSampling(variant){return {sampler_name:'euler',scheduler:'simple',cfg:1,denoise:1,shift_video:variant.family==='ref2va'?12:6,shift_audio:3};}
  function loraModeCompatible(name,mode){
    const pika=pikaVariant(name);if(pika)return pika.family===(mode==='refs'?'ref2va':'fl2va');
    if(isCharacterSwap(name)||isAnimeToRealism(name))return mode==='refs';
    if(/turbo|lightx2v/i.test(name))return false;
    const fl=/fl2v|t2v/i.test(name),ref=/ref2v|r2v/i.test(name);
    return mode==='refs'?!(fl&&!ref):!(ref&&!fl);
  }
  function preservedReference(spec){
    const key=spec.preserve_reference_audio;if(!key)return null;
    if(spec.mode!=='refs')throw Error('Source soundtrack reuse requires References mode.');
    if(spec.continuation)throw Error('Source soundtrack reuse with continuation has not been validated.');
    const videos=(spec.references||[]).filter(r=>r.kind==='video'),aliases=videos.filter(r=>r.alias===key),matches=aliases.length?aliases:videos.filter(r=>r.asset_id===key);
    if(matches.length!==1)throw Error('Select an unambiguous source video for soundtrack reuse.');
    if(!matches[0].use_audio)throw Error('Enable the selected source video soundtrack before reusing audio.');
    return matches[0];
  }
  // Interactive transitions apply prerequisites. Restoring saved work never rewrites intent.
  function normalizeSelection(spec,action,caps={}){
    if(action==='restore')return {...spec};
    const s={...spec,sampling:{...spec.sampling},loras:(spec.loras||[]).map(x=>({...x}))};
    if(action==='mode'&&s.mode!=='refs')s.preserve_reference_audio=null;
    let pika=s.loras.find(x=>x.enabled&&pikaVariant(x.name));
    if(action==='continuation'&&s.continuation){for(const l of s.loras)if(pikaVariant(l.name))l.enabled=false;pika=null;if(['turbo','turbo_ref'].includes(s.render_method)){s.render_method='native';s.steps=20;}s.enable_refine=false;s.refine=false;s.control={...s.control,enabled:false};}
    if(action==='mode'&&pika){
      const variant=pikaVariant(pika.name),family=s.mode==='refs'?'ref2va':'fl2va';
      if(variant.family!==family){const name=Object.keys(PIKA).find(n=>PIKA[n].steps===variant.steps&&PIKA[n].variant===variant.variant&&PIKA[n].family===family),other=s.loras.find(x=>x.name===name);pika.enabled=false;if(other){other.enabled=true;pika=other;}else pika=null;}
    }
    if(action==='profile'&&!pikaProfileCompatible(s)){for(const l of s.loras)if(pikaVariant(l.name))l.enabled=false;pika=null;}
    if(action==='method'&&s.render_method!=='native'){for(const l of s.loras)if(pikaVariant(l.name))l.enabled=false;pika=null;}
    if(['mode','profile'].includes(action)&&['turbo','turbo_ref'].includes(s.render_method)){
      const matching=s.mode==='refs'?'turbo_ref':'turbo';
      s.render_method=(s.model_profile||'original')==='original'&&caps[matching==='turbo'?'turbo_ready':'turbo_ref_ready']?matching:'native';
      s.steps=s.render_method==='turbo_ref'?8:s.render_method==='turbo'?6:20;
    }
    if(pika){
      const variant=pikaVariant(pika.name);if(!pikaProfileCompatible(s))s.model_profile='original';s.render_method='native';s.steps=variant.steps;
      s.sampling={...s.sampling,...pikaSampling(variant)};pika.strength=1;
      for(const l of s.loras)if(l!==pika)l.enabled=false;
    }
    if(pika||['turbo','turbo_ref'].includes(s.render_method)){
      s.enable_refine=false;s.refine=false;s.control={...s.control,enabled:false};s.audio_refinement={...s.audio_refinement,enabled:false};
      if(!pika){for(const l of s.loras)l.enabled=false;s.steps=s.render_method==='turbo_ref'?8:s.steps>=4&&s.steps<=8?s.steps:6;}
    }else if(s.sampling.sampler_name==='h3_turbo')delete s.sampling.sampler_name;
    if(s.model_profile==='hybrid_loader')s.sampling.weight_dtype='default';
    return s;
  }
  function selectionRestrictions(spec){
    const pika=(spec.loras||[]).some(x=>x.enabled&&pikaVariant(x.name));
    const managed=pika||['turbo','turbo_ref'].includes(spec.render_method);
    const single=managed?'This selected adapter/method requires a single generation pass.':'';
    return {managed,sampling:managed,refine:single||(spec.control?.enabled?'Disable ControlNet before refinement.':spec.continuation?'Clear continuation before refinement.':''),
      control:single||(spec.enable_refine||spec.refine?'Disable refinement before ControlNet.':spec.continuation?'Clear continuation before ControlNet.':spec.audio_refinement?.enabled?'Disable audio enhancement before ControlNet.':''),
      audio:single||(spec.control?.enabled?'Disable ControlNet before audio enhancement.':spec.preserve_reference_audio?'Original reference soundtrack is preserved; generated-audio enhancement is bypassed.':''),
      pika:spec.continuation?'Clear continuation before selecting Pika.':'',turbo:spec.continuation?'Clear continuation before selecting Turbo.':''};
  }
  function validatePika(spec){
    const active=(spec.loras||[]).filter(x=>x.enabled), selected=active.filter(x=>pikaVariant(x.name));
    if(!selected.length)return null;
    const lora=selected[0], variant=pikaVariant(lora.name);
    if(active.length!==1||Number(lora.strength??1)!==1)throw Error('Pika Flex requires one adapter at strength 1.');
    if(!pikaProfileCompatible(spec)||(spec.render_method||'native')!=='native'||variant.family!==(spec.mode==='refs'?'ref2va':'fl2va'))throw Error('Pika Flex requires Original or supported Singularity v2 References with the matching adapter.');
    if(Number(spec.steps)!==variant.steps)throw Error('Pika Flex requires '+variant.steps+' steps.');
    if(spec.enable_refine||spec.refine||spec.control?.enabled||spec.continuation||spec.audio_refinement?.enabled)throw Error('Pika Flex requires a single pass without refinement, ControlNet or continuation.');
    const required={sampler_name:'euler',scheduler:'simple',cfg:1,denoise:1,shift_video:variant.family==='ref2va'?12:6,shift_audio:3};
    for(const [key,value] of Object.entries(required))if(spec.sampling?.[key]!==value)throw Error('Pika Flex sampling disagrees: '+key);
    return variant;
  }
  function resolve(spec,caps={}){
    preservedReference(spec);
    const dials=spec.dials||[];
    if(!Array.isArray(dials))throw Error('Dials must be a list.');
    if(dials.filter(x=>x.enabled).length>12)throw Error('At most 12 Dials can be applied.');
    if(spec.steps!=null&&(!Number.isInteger(Number(spec.steps))||Number(spec.steps)<1||Number(spec.steps)>100))throw Error('Steps must be an integer between 1 and 100.');
    for(const dial of dials.filter(x=>x.enabled)){
      if(!caps.dials_ready||!(caps.dial_files||[]).includes(dial.name))throw Error('Dial runtime or selected file is unavailable. Run the launcher with --matlow.');
      if(!Number.isFinite(dial.strength)||dial.strength < -20||dial.strength>20)throw Error('Dial strength must be between -20 and 20.');
    }
    if((spec.loras||[]).some(x=>x.enabled&&/^dials[\\/]/i.test(x.name||'')))throw Error('Use the Dials panel for steering files; they are not ordinary LoRAs.');
    if(spec.control?.enabled&&(spec.enable_refine||spec.refine||spec.continuation||spec.audio_refinement?.enabled))throw Error('ControlNet cannot be combined with refinement, continuation or audio enhancement.');
    if((spec.loras||[]).some(x=>x.enabled&&/^qwen21[\\/]/i.test(x.name||'')))throw Error('Qwen Image adapters belong in Create Image, not H3 video.');
    validatePika(spec);
    validateCharacterSwap(spec);
    validateAnimeToRealism(spec);
    for(const lora of spec.loras||[])if(lora.enabled&&!loraModeCompatible(lora.name,spec.mode))throw Error('LoRA '+lora.name+' is unsupported in the selected input mode/family.');
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
    if((spec.loras||[]).some(x=>x.enabled&&/turbo|lightx2v/i.test(x.name)&&!pikaVariant(x.name)))throw Error('Select Turbo v4 from Render method; standalone Turbo adapters are unsupported.');
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
    return {profile,family,checkpoint:name,loader,settings,hybrid_preset:preset,experimental:profile!=='original',dials:dials.filter(x=>x.enabled)};
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
  return {PIKA,pikaVariant,pikaSampling,loraModeCompatible,preservedReference,normalizeSelection,selectionRestrictions,validatePika,TURBO_REF,TURBO,defaults,profiles,resolve,patchOptions,FL,REF,CHARACTER_SWAP,isCharacterSwap,preferredCharacterSwap,validateCharacterSwap,ANIME_TO_REALISM,isAnimeToRealism,validateAnimeToRealism};
});
