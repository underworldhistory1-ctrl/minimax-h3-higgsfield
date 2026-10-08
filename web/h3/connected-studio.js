/* Connected preparation and structural controls. Existing textarea/state remain authoritative. */
(function(){
  'use strict';
  const panel=document.createElement('section');panel.className='panel';panel.id='preparationPanel';
  panel.innerHTML='<h2>Prompt preparation</h2><label for="preparationMode">Before generation</label><select id="preparationMode"><option value="ai">Understand references &amp; prepare with AI</option><option value="native">Use my prompt directly</option></select><div id="writerStatus" class="tip" role="status"></div><button id="preparePrompt" class="button alt smallbtn" type="button">Preview prepared prompt</button><div id="preparationStatus" class="notice" role="status"></div>';
  const promptPanel=$('prompt').closest('.panel');promptPanel.after(panel);
  const controlPanel=document.createElement('details');controlPanel.className='panel';controlPanel.id='controlPanel';
  controlPanel.innerHTML='<summary>Motion &amp; region control</summary><label><input id="enableControl" type="checkbox"> Fun-ControlNet Union 2.0</label><div id="controlAvailability" class="tip" role="status"></div><label for="controlKind">Control input</label><select id="controlKind"><option value="pose">Prepared pose video</option><option value="depth">Prepared depth video</option><option value="canny">Prepared edges · Canny</option><option value="hed">Prepared edges · HED</option><option value="mlsd">Prepared lines · MLSD</option><option value="scribble">Scribble video</option><option value="layout">Layout video</option><option value="gray">Grayscale video</option><option value="inpaint">Regenerate a masked region</option></select><label for="controlVideo">Prepared control video</label><input id="controlVideo" type="file" accept=".mp4,.mov,.webm,.mkv"><div class="tip">Upload the actual control representation, not an ordinary reference video. It is fitted and trimmed to this canvas and duration. Automatic pose extraction is not configured.</div><div id="maskInputs" class="hidden"><label for="controlSource">Source video to edit</label><input id="controlSource" type="file" accept=".mp4,.mov,.webm,.mkv"><label for="controlMask">Static grayscale mask</label><input id="controlMask" type="file" accept=".png"><div class="tip">White = regenerate, black = source guidance. The mask must match the canvas. A static mask suits a fixed region; moving people need a tracked mask workflow.</div></div><label for="controlStrength">Control strength</label><input id="controlStrength" type="number" min="0.05" max="2" step="0.05" value="1"><div id="controlStatus" class="notice" role="status"></div>';
  panel.after(controlPanel);
  state.control=state.control||{enabled:false};state.controlInputs=state.controlInputs||{};
  const saved=localStorage.getItem(draftKey+'.preparation');$('preparationMode').value=saved==='native'?'native':'ai';
  $('preparationMode').onchange=()=>{localStorage.setItem(draftKey+'.preparation',$('preparationMode').value);state.preparedContext=null;saveDraft();};
  $('enableControl').onchange=()=>{state.control.enabled=$('enableControl').checked;state.preparedContext=null;};
  $('controlKind').onchange=()=>{$('maskInputs').classList.toggle('hidden',$('controlKind').value!=='inpaint');state.control.kind=$('controlKind').value;state.preparedContext=null;};
  $('controlStrength').onchange=()=>{state.control.strength=Number($('controlStrength').value);state.preparedContext=null;};
  for(const [id,key] of [['controlVideo','video'],['controlSource','source'],['controlMask','mask']])$(id).onchange=()=>{const file=$(id).files[0];state.controlInputs[key]=file?{file,kind:key==='mask'?'image':'video',alias:'control_'+key,role:'control'}:null;state.preparedContext=null;$('controlStatus').textContent=file?'Selected '+file.name:'';};
  function currentControl(){return state.control.enabled?{enabled:true,kind:$('controlKind').value,strength:Number($('controlStrength').value),start_percent:0,end_percent:1,model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors'}:null;}
  function refreshAvailability(){
    const caps=state.labCapabilities||{};
    $('enableRefine').disabled=state.busy||!caps.refine_ready;
    $('refineAvailability').textContent=caps.refine_ready?'Verified on this server. Adds a 10-step second pass.':(caps.refine_missing_reasons||['Refine is not installed.']).join(' ');
    $('enableControl').disabled=state.busy||!caps.controlnet_ready;
    $('controlAvailability').textContent=caps.controlnet_ready?'ControlNet 2.0 ready · Text or Frames only.':(caps.controlnet_missing_reasons||['ControlNet 2.0 is not installed.']).join(' ');
    $('writerStatus').textContent=state.promptProvider?.configured?'Prompt model: '+state.promptProvider.model+'. Video is understood through sampled frames; audio requires supplied dialogue.':state.promptProvider?.reason||'Checking prompt model configuration…';
  }
  async function refreshProvider(){try{const r=await fetch(api('/h3_studio/lab/prompt/status'));state.promptProvider=r.ok?await r.json():{configured:false,reason:'Update this server to enable connected AI preparation.'};}catch{state.promptProvider={configured:false,reason:'Prompt service is unavailable.'};}refreshAvailability();}
  function waitForQueue(signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException("Cancelled","AbortError"));return;}const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new DOMException("Cancelled","AbortError"));};const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},3000);signal?.addEventListener("abort",abort,{once:true});});}
  async function prepare(uploads,signal){
    const epoch=state.generationEpoch;
    const spec=currentRenderSpec();spec.references=orderedRefs().map(r=>({...spec.references.find(item=>item.alias===r.alias),filename:uploads.refs.get(r)}));
    spec.frames={start:uploads.first,end:uploads.last};spec.control=currentControl();
    $('preparationStatus').textContent='Understanding the brief and connected reference frames…';
    let result;
    try{while(true){
      const response=await fetch(api('/h3_studio/lab/prompt/prepare'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(spec),signal});
      result=await response.json();if(epoch!==state.generationEpoch||signal?.aborted)throw Error('Cancelled');
      if(response.status===409&&['PREPARATION_QUEUE_BUSY','PREPARATION_BUSY'].includes(result.code)){
        state.waitingPreparation=true;state.phaseEtaAt=null;
        setProgress('Waiting for shared server · prompt preparation',null,null,true);
        $('remaining').textContent='Render estimate starts when your job runs';
        $('preparationStatus').textContent='Your inputs are retained. Preparing automatically when the shared server is available. Cancel stops this request only.';
        await pollQueue();await waitForQueue(signal);continue;
      }
      if(!response.ok)throw Error(result.error||'AI preparation failed.');
      break;
    }}finally{if(epoch===state.generationEpoch||signal?.aborted)state.waitingPreparation=false;}
    if(epoch!==state.generationEpoch||signal?.aborted)throw Error('Cancelled');
    // Revalidate through the same native compiler used by the graph.
    H3PromptCompiler.compilePrompt({...currentRenderSpec(),source_prompt:result.compiled_prompt,prompt_mode:'structured'});
    state.preparedContext=result;state.lastCompiledPrompt=result.compiled_prompt;state.lastBindings=result.bindings;
    $('compiledPromptDisplay').textContent=result.compiled_prompt;
    $('preparationStatus').textContent=(result.warnings||[]).join(' ')||'Prepared. This exact prompt will be sent to H3.';
    return result.compiled_prompt;
  }
  async function controlUploads(sendFile,uploads){
    const control=currentControl();if(!control)return;
    if(state.mode==='refs'||state.continuation||$('enableRefine').checked)throw Error('ControlNet uses Text or Frames without continuation or Refine.');
    if(!state.controlInputs.video&&control.kind!=='inpaint')throw Error('Attach a prepared control video.');
    if(control.kind==='inpaint'&&(!state.controlInputs.source||!state.controlInputs.mask))throw Error('Attach a source video and a matching white/black mask.');
    const prepareVideo=async(item,label)=>{
      const uploaded=await sendFile(item.file,'video',label,{...item,fitVideo:false});
      const response=await fetch(api('/h3_studio/lab/control/prepare'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:uploaded.name,width:state.width,height:state.height,target_frames:Number($('duration').value)}),signal:state.abortController?.signal});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Control alignment failed.');
      state.uploads.push(result.filename);return result;
    };
    if(state.controlInputs.video){const result=await prepareVideo(state.controlInputs.video,'Control representation');Object.assign(control,result,{control_file:result.filename});uploads.control=result.filename;}
    else Object.assign(control,{fps:24,frame_count:Number($('duration').value),width:state.width,height:state.height});
    if(control.kind==='inpaint'){
      const source=await prepareVideo(state.controlInputs.source,'Source region');control.source_file=source.filename;uploads.source=source.filename;
      const mask=state.controlInputs.mask;const bitmap=await createImageBitmap(mask.file);const valid=bitmap.width===state.width&&bitmap.height===state.height;bitmap.close();
      if(!valid)throw Error('Mask dimensions must match the selected canvas exactly.');
      const result=await sendFile(mask.file,'image','Control mask',mask);control.mask_file=result.name;uploads.mask=result.name;
    }
    state.control=control;$('controlStatus').textContent='Control files aligned and verified for this canvas.';
  }
  $('preparePrompt').onclick=async()=>{
    if(state.busy||state.running)return;
    if(state.projectLoading){info("Wait for project restoration before preparing.",true);return;}
    if(state.restoreMissing?.length){info("Reattach missing project inputs before preparing.",true);return;}
    if(!state.promptProvider?.configured){info(state.promptProvider?.reason||'Configure the prompt model on this server.',true);return;}
    const epoch=++state.generationEpoch;state.started=Date.now();state.phaseEtaAt=null;setBusy(true);const previewController=new AbortController();state.abortController=previewController;const uploads={refs:new Map(),first:null,last:null};
    try{
      const files=state.mode==='refs'?orderedRefs():state.mode==='frames'?[state.first,state.last].filter(Boolean):[];
      for(const item of files){
        const kind=item.kind||'image';let file=item.file,result;
        if(kind==='image'&&item.assetId){
          const fit=state.mode==='frames'?(item.imageFit||$('frameFit').value):item.imageFit||'preserve';
          result=await projectCtrl.fetchJson(`/h3_studio/lab/assets/${encodeURIComponent(item.assetId)}/resolve`,{method:'POST',body:JSON.stringify({fit,width:state.width,height:state.height})});result.name=result.filename;state.uploads.push(result.name);
        }else{
          if(kind==='image'&&state.mode==='frames')file=await fitFrameImage(file,item.imageFit||null);
          else if(kind==='image'&&item.imageFit&&item.imageFit!=='preserve')file=await fitFrameImage(file,item.imageFit);
          result=await uploadOne(file,kind,()=>{},()=>{}, {resize:kind==='image'?(state.mode==='frames'?$('fitFrames').checked:$('fitImages').checked):kind==='video'&&item.fitVideo!==false,trimEnabled:!!item.trimEnabled,trimStart:item.trimStart||0,trimDuration:item.trimDuration});
        }
        item.meta=result;if(state.mode==='refs')uploads.refs.set(item,result.name);else if(item===state.first)uploads.first=result.name;else uploads.last=result.name;
      }
      if(epoch!==state.generationEpoch)throw Error('Cancelled');
      await prepare(uploads,state.abortController.signal);
      if(epoch!==state.generationEpoch){state.preparedContext=null;return;}
      setProgress('Prompt preview ready',100,null);info('Prepared prompt preview is ready. Generate prepares against the actual uploaded inputs again.');
    }catch(error){if(epoch===state.generationEpoch)info(error.message,true);}finally{if(epoch===state.generationEpoch||state.abortController===previewController){await cleanupUploads();setBusy(false);state.abortController=null;refreshAvailability();}}
  };
  function restoreControl(){
    $('enableControl').checked=!!state.control?.enabled;
    $('controlKind').value=state.control?.kind||'pose';$('controlStrength').value=state.control?.strength??1;
    $('maskInputs').classList.toggle('hidden',$('controlKind').value!=='inpaint');
    $('controlStatus').textContent=Object.values(state.controlInputs||{}).filter(Boolean).map(item=>item.file.name).join(' · ');
  }
  window.H3ConnectedStudio={prepare,controlUploads,refreshProvider,refreshAvailability,currentControl,restoreControl};
  refreshProvider();
})();
