/* Capability-driven studio controls. Values belong to drafts, never to DOM-only presets. */
(function(){
  'use strict';
  state.sampling=state.sampling||{};state.nodeOptions=state.nodeOptions||{};state.refinement=state.refinement||{};
  const panel=document.createElement('section');panel.className='panel';panel.id='modelConfiguration';
  panel.innerHTML='<h2>Model &amp; workflow</h2><label for="modelProfile">H3 checkpoint family</label><select id="modelProfile"></select><label for="checkpoint">Installed checkpoint</label><select id="checkpoint"></select><div id="checkpointNotice" class="tip" role="status"></div><label for="hybridPreset">Tensor overlay</label><select id="hybridPreset"><option value="none">None · single FL2VA baseline</option><option value="block_range_adaln">AdaLN blocks 45–49</option><option value="all_adaln">All AdaLN · community experiment</option></select><details id="samplingControls"><summary>Advanced sampling &amp; acceleration</summary><div id="samplingFields" class="configuration-grid"></div><div id="patchFields" class="configuration-grid"></div><details><summary>Refinement pass settings</summary><div id="refinementFields" class="configuration-grid"></div></details><button id="resetSampling" type="button" class="button alt smallbtn">Restore baseline settings</button></details><details><summary>Video style transformation</summary><label for="styleDirection">Direction</label><select id="styleDirection"><option value="anime_to_realism">Anime → realism</option><option value="realism_to_anime">Realism → anime</option></select><label for="preserveAudio"><input id="preserveAudio" type="checkbox"> Reuse source soundtrack</label><button id="applyStyle" type="button" class="button alt smallbtn">Prepare selected direction</button><div class="tip">Add a source video in References. Select compatible installed style LoRAs separately. References guide a new take; review cuts and timing.</div></details>';
  document.querySelector('.model-hero').after(panel);
  for(const [value,p] of Object.entries(H3Configuration.profiles)){const o=document.createElement('option');o.value=value;o.textContent=p.label;$('modelProfile').append(o);}
  function changed(){saveDraft();updatePreviewLive();renderEstimates();}
  $('modelProfile').onchange=()=>{
    if(state.busy)return;
    if(state.continuation?.type==='generated'){info('Re-encode the source video before changing checkpoint families.',true);$('modelProfile').value=state.modelProfile||'original';return;}
    state.modelProfile=$('modelProfile').value;state.checkpoint=null;refresh().then(()=>{changed();updateCapabilities();});
  };
  $('checkpoint').onchange=()=>{if(state.busy)return;state.checkpoint=$('checkpoint').value;changed();updateCapabilities();};
  $('hybridPreset').onchange=()=>{state.hybridPreset=$('hybridPreset').value;changed();};
  $('resetSampling').onclick=()=>{state.sampling={};state.nodeOptions={};state.refinement={};state.refineScale=1.25;refresh();changed();};
  $('preserveAudio').onchange=()=>{state.preserveReferenceAudio=$('preserveAudio').checked;changed();};
  $('applyStyle').onclick=()=>{
    if(state.busy)return;
    const refs=state.refs.filter(r=>r.kind==='video');if(refs.length!==1){info('Add one source video in References to prepare this transformation.',true);return;}
    selectMode('refs');if(state.mode!=='refs')return;
    const ref=refs[0];ref.role='whole scene';ref.useAudio=true;
    state.styleDirection=$('styleDirection').value;
    const direction=state.styleDirection==='anime_to_realism'?'live-action photorealism with natural skin, practical lighting and realistic materials':'anime with clean linework, cel shading and deliberately stylized materials';
    $('prompt').value='Transform @'+ref.alias+' into '+direction+'. Preserve the source action, camera intent, composition and event order. '+($('preserveAudio').checked?'Keep the source soundtrack.':'Generate synchronized native audio matching the scene.');
    state.preserveReferenceAudio=$('preserveAudio').checked;renderRefs();changed();
  };
  function field(parent,key,label,value,descriptor,onchange){
    const wrap=document.createElement('label');wrap.textContent=label;const [type,limits={}]=descriptor;
    let input;
    if(Array.isArray(type)){input=document.createElement('select');for(const item of type){const o=document.createElement('option');o.value=item;o.textContent=item;input.append(o);}input.value=value;}
    else {input=document.createElement('input');input.type=type==='BOOLEAN'?'checkbox':'number';if(type==='BOOLEAN')input.checked=!!value;else{input.value=value;input.step=limits.step??(type==='INT'?1:0.01);if(limits.min!=null)input.min=limits.min;if(limits.max!=null)input.max=limits.max;}}
    input.dataset.setting=key;input.disabled=state.busy;input.onchange=()=>{if(input.type==='number'&&!input.checkValidity()){input.reportValidity();return;}onchange(type==='BOOLEAN'?input.checked:Array.isArray(type)?input.value:Number(input.value));changed();};wrap.append(input);parent.append(wrap);
  }
  let schemaServer=null,liveSchemas={};
  async function schemas(){
    const server=api('');if(schemaServer===server){if(state.labCapabilities)state.labCapabilities.node_schemas=liveSchemas;return;}schemaServer=server;
    const names=['KSampler','UNETLoader','MiniMaxH3SigmaShift','SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache'];
    const results=await Promise.allSettled(names.map(async name=>{const r=await fetch(api('/object_info/'+name));if(!r.ok)throw Error(name);return r.json();}));
    if(api('')!==server){schemaServer=null;return;}
    state.labCapabilities=state.labCapabilities||{};liveSchemas={};state.labCapabilities.node_schemas=liveSchemas;
    for(const r of results)if(r.status==='fulfilled')Object.assign(liveSchemas,r.value);
    if(results.some(r=>r.status==='rejected'))schemaServer=null;
  }
  async function refresh(){
    await schemas();
    const caps=state.labCapabilities||{},profile=state.modelProfile||'original';
    $('modelProfile').value=profile;document.body.dataset.modelAccent=H3Configuration.profiles[profile]?.accent||'original';
    document.querySelector('.model-hero h1').textContent=profile==='original'?'MiniMax H3':H3Configuration.profiles[profile]?.label||'MiniMax H3';
    document.querySelector('.model-hero .eyebrow').textContent=profile==='original'?'MODEL · H3 BASE':'MODEL · COMMUNITY CHECKPOINT';
    for(const option of $('modelProfile').options)option.disabled=option.value!=='original'&&(!(caps.model_catalog||[]).some(x=>x.profiles.includes(option.value))||option.value==='hybrid_loader'&&!caps.hybrid_loader_ready);
    const select=$('checkpoint');select.replaceChildren();
    const names=profile==='original'?[state.mode==='refs'?modelRef:modelFL]:(caps.model_catalog||[]).filter(x=>x.profiles.includes(profile)).map(x=>x.name);
    if(state.checkpoint&&!names.includes(state.checkpoint))names.unshift(state.checkpoint);
    for(const name of names){const o=document.createElement('option');o.value=name;o.textContent=name;o.disabled=profile!=='original'&&!(caps.model_catalog||[]).some(x=>x.name===name);select.append(o);}
    if(!state.checkpoint&&names.length)state.checkpoint=names[0];select.value=profile==='original'?names[0]:state.checkpoint||'';
    select.disabled=state.busy||profile==='original';$('modelProfile').disabled=state.busy;
    $('hybridPreset').hidden=profile!=='hybrid_loader';document.querySelector('label[for="hybridPreset"]').hidden=profile!=='hybrid_loader';$('hybridPreset').value=state.hybridPreset||'none';
    $('checkpointNotice').textContent=profile==='original'?'Native audio · mode selects the original FL2VA or Ref2VA checkpoint.':profile==='hybrid_conditioning'?'Community experiment: FL2VA weights with native reference conditioning. This does not merge models. No GPU validation on this installation.':profile==='hybrid_loader'?'Community tensor overlays, separate from reference conditioning. Format compatibility is checked by the loader. No GPU validation on this installation.':'Independent community checkpoint. File availability does not certify quality or acceleration compatibility.';
    const fields=$('samplingFields');fields.replaceChildren();
    const descriptors={sampler_name:[caps.sampling_options?.samplers||['res_multistep']],scheduler:[caps.sampling_options?.schedulers||['simple']],weight_dtype:[caps.sampling_options?.weight_dtypes||['default']],cfg:['FLOAT',{min:0,max:100}],denoise:['FLOAT',{min:0,max:1}],shift_video:['FLOAT',{min:0,max:100}],shift_audio:['FLOAT',{min:0,max:100}]};
    for(const [key,d] of Object.entries(descriptors))field(fields,key,key.replaceAll('_',' '),state.sampling[key]??H3Configuration.defaults[key],d,value=>state.sampling[key]=value);
    const refineFields=$('refinementFields');refineFields.replaceChildren();
    const refineDefaults={steps:10,denoise:.4,cfg:1,sampler_name:'res_multistep',scheduler:'simple'};
    const refineDescriptors={steps:['INT',{min:1,max:100}],denoise:['FLOAT',{min:0,max:1}],cfg:['FLOAT',{min:0,max:100}],sampler_name:descriptors.sampler_name,scheduler:descriptors.scheduler};
    for(const [key,d] of Object.entries(refineDescriptors))field(refineFields,'refine_'+key,key.replaceAll('_',' '),state.refinement?.[key]??refineDefaults[key],d,value=>{state.refinement=state.refinement||{};state.refinement[key]=value;});
    field(refineFields,'refine_scale','Latent upscale',state.refineScale??1.25,['FLOAT',{min:1,max:1.25,step:.05}],value=>state.refineScale=value);
    const patches=$('patchFields');patches.replaceChildren();
    const klass=method()==='spectrum'?'SpectrumApplyMiniMaxH3':method()==='motioncache'?'MiniMaxH3MotionCache':null;
    if(klass&&caps.node_schemas?.[klass]){
      const schema=caps.node_schemas[klass].input;
      // Use the submitted baseline as the source of displayed defaults.
      let graph;try{graph=H3GraphBuilder.buildGraph({mode:'text',render_method:method(),target_frames:124},{},caps);}catch{}
      const node=Object.values(graph||{}).find(x=>x.class_type===klass);
      for(const [key,d] of Object.entries({...schema.required,...schema.optional}))if(node&&key in node.inputs&&!Array.isArray(node.inputs[key])&&(Array.isArray(d[0])||['INT','FLOAT','BOOLEAN'].includes(d[0])))field(patches,key,key.replaceAll('_',' '),state.nodeOptions[klass]?.[key]??node.inputs[key],d,value=>{state.nodeOptions[klass]=state.nodeOptions[klass]||{};state.nodeOptions[klass][key]=value;});
    }
    $('preserveAudio').checked=!!state.preserveReferenceAudio;$('styleDirection').value=state.styleDirection||'anime_to_realism';
    for(const id of ['applyStyle','preserveAudio','styleDirection','hybridPreset','resetSampling'])$(id).disabled=state.busy;
  }
  $('renderMethod').addEventListener('change',refresh);
  window.H3ConfigurationUI={refresh};refresh();
  // Desktop resize handle supports pointer and keyboard, with a persisted width.
  const handle=document.createElement('div');handle.className='sidebar-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','Resize settings sidebar');handle.setAttribute('aria-orientation','vertical');document.querySelector('.left').append(handle);
  function resize(value){const max=Math.min(850,innerWidth-360),width=Math.max(390,Math.min(max,value));document.documentElement.style.setProperty('--settings-width',width+'px');handle.setAttribute('aria-valuenow',width);handle.setAttribute('aria-valuemin',390);handle.setAttribute('aria-valuemax',Math.max(390,max));return width;}
  let width=resize(Number(localStorage.getItem('h3studio.sidebar.width'))||740);
  handle.onpointerdown=e=>{if(innerWidth<=1100)return;handle.setPointerCapture(e.pointerId);handle.onpointermove=move=>width=resize(move.clientX);handle.onpointerup=()=>{handle.onpointermove=null;localStorage.setItem('h3studio.sidebar.width',width);};handle.onpointercancel=()=>handle.onpointermove=null;};
  handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();width=resize(width+(e.key==='ArrowLeft'?-20:20));localStorage.setItem('h3studio.sidebar.width',width);}};
  addEventListener('resize',()=>width=resize(width));
})();
