/* Connected preparation and structural controls. Existing textarea/state remain authoritative. */
(function(){
  'use strict';
  const panel=document.createElement('section');panel.className='panel';panel.id='preparationPanel';
  panel.innerHTML='<h2>Prompt preparation</h2><label for="preparationMode">Before generation</label><select id="preparationMode"><option value="auto">Automatic · format &amp; use AI when available</option><option value="ai">Understand references &amp; prepare with AI</option><option value="native">Use my prompt directly</option></select><div id="writerStatus" class="tip" role="status"></div><button id="preparePrompt" class="button alt smallbtn" type="button">Preview prepared prompt</button><div id="preparationStatus" class="notice" role="status"></div>';
  const promptPanel=$('prompt').closest('.panel');promptPanel.after(panel);
  const controlPanel=document.createElement('details');controlPanel.className='panel';controlPanel.id='controlPanel';
  controlPanel.innerHTML='<summary>Motion &amp; region control</summary><label><input id="enableControl" type="checkbox"> Control motion or structure</label><div id="controlAvailability" class="tip" role="status"></div><label for="controlInputType">Video input</label><select id="controlInputType"><option value="video">Ordinary video · extract guidance</option><option value="prepared">Prepared control map · advanced</option></select><label for="controlKind">What should the video guide?</label><select id="controlKind"><option value="pose">Follow body motion</option><option value="depth">Preserve scene structure</option><option value="canny">Follow outlines</option><option value="gray">Follow lighting</option><option value="hed">Prepared soft edges · HED</option><option value="mlsd">Prepared lines · MLSD</option><option value="scribble">Prepared scribble</option><option value="layout">Prepared layout</option><option value="inpaint">Regenerate a masked region</option></select><div id="controlPreprocessorStatus" class="tip" role="status"></div><div id="controlVideoInputs"><label for="controlVideo" id="controlVideoLabel">Source video</label><input id="controlVideo" type="file" accept=".mp4,.mov,.webm,.mkv"><div id="controlVideoHelp" class="tip">Upload an ordinary video. Studio extracts the selected guidance, then fits it to the canvas and duration.</div></div><div id="maskInputs" class="hidden"><label for="controlSource">Source video to edit</label><input id="controlSource" type="file" accept=".mp4,.mov,.webm,.mkv"><label for="controlMask">Static grayscale mask</label><input id="controlMask" type="file" accept=".png"><div class="tip">White = regenerate, black = source guidance. The mask must match the canvas. A static mask suits a fixed region; moving people need a tracked mask workflow.</div></div><label for="controlStartSeconds">Source start (seconds)</label><input id="controlStartSeconds" type="number" min="0" max="3600" step="0.1" value="0"><div id="controlSourceSpan" class="tip"></div><label for="controlStrength">Control strength</label><input id="controlStrength" type="number" min="0.05" max="2" step="0.05" value="1"><div id="controlStatus" class="notice" role="status"></div>';

  panel.after(controlPanel);
  state.control=state.control||{enabled:false,input_type:'video'};state.controlInputs=state.controlInputs||{};
  const saved=localStorage.getItem(draftKey+'.preparation');$('preparationMode').value=['native','ai','auto'].includes(saved)?saved:'auto';
  $('preparationMode').onchange=()=>{localStorage.setItem(draftKey+'.preparation',$('preparationMode').value);state.preparedContext=null;refreshAvailability();saveDraft();};
  $('enableControl').onchange=()=>{state.control.enabled=$('enableControl').checked;state.preparedContext=null;saveDraft();};
  $('controlKind').onchange=()=>{state.control.kind=$('controlKind').value;state.preparedContext=null;refreshControlInputs();saveDraft();};
  $('controlInputType').onchange=()=>{state.control.input_type=$('controlInputType').value;state.preparedContext=null;refreshControlInputs();saveDraft();};
  $('controlStartSeconds').onchange=()=>{state.control.start_seconds=Number($('controlStartSeconds').value);state.preparedContext=null;refreshControlInputs();saveDraft();};
  $('controlStrength').onchange=()=>{state.control.strength=Number($('controlStrength').value);state.preparedContext=null;};
  for(const [id,key] of [['controlVideo','video'],['controlSource','source'],['controlMask','mask']])$(id).onchange=()=>{const file=$(id).files[0];state.controlInputs[key]=file?{file,kind:key==='mask'?'image':'video',alias:'control_'+key,role:'control'}:null;state.preparedContext=null;$('controlStatus').textContent=file?'Selected '+file.name:'';};
  function currentControl(){return state.control.enabled?{enabled:true,kind:$('controlKind').value,input_type:$('controlInputType').value,start_seconds:Number($('controlStartSeconds').value),source_span:state.control.source_span||null,mask_alignment:state.control.mask_alignment||null,plan_note:state.control.plan_note||'',strength:Number($('controlStrength').value),start_percent:0,end_percent:1,model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors'}:null;}
  function refreshAvailability(){
    const caps=state.labCapabilities||{};
    $('enableRefine').disabled=state.busy||!caps.refine_ready;
    $('refineAvailability').textContent=caps.refine_ready?'Verified on this server. Adds a 10-step second pass.':(caps.refine_missing_reasons||['Refine is not installed.']).join(' ');
    $('enableControl').disabled=state.busy||!caps.controlnet_ready;
    $('controlAvailability').textContent=caps.controlnet_ready?'ControlNet 2.0 ready · Text or Frames only.':(caps.controlnet_missing_reasons||['ControlNet 2.0 is not installed.']).join(' ');
    refreshControlInputs();
    $('writerStatus').textContent=usePromptAI()?(state.promptProvider?.configured?'AI preparation: '+state.promptProvider.model+'. Video uses sampled frames; audio requires supplied dialogue.':state.promptProvider?.reason||'Checking prompt model configuration…'):'Automatic formatting is active. '+(state.promptProvider?.configured?'Reference understanding with AI is available.':'AI scene understanding is not configured on this server.');
  }
  function refreshProvider(){
    if(state.promptProviderCheck)return state.promptProviderCheck;
    state.promptProviderCheck=(async()=>{
      try{const r=await fetch(api('/h3_studio/lab/prompt/status'));state.promptProvider=r.ok?await r.json():{configured:false,reason:'Update this server to enable connected AI preparation.'};}
      catch{state.promptProvider={configured:false,reason:'Prompt service is unavailable.'};}
      finally{refreshAvailability();state.promptProviderCheck=null;}
    })();
    return state.promptProviderCheck;
  }
  function waitForQueue(signal){return new Promise((resolve,reject)=>{if(signal?.aborted){reject(new DOMException("Cancelled","AbortError"));return;}const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new DOMException("Cancelled","AbortError"));};const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},3000);signal?.addEventListener("abort",abort,{once:true});});}
  async function prepare(uploads,signal){
    const epoch=state.generationEpoch;
    const spec=currentRenderSpec();spec.source_prompt=H3PromptInput.normalize(spec.source_prompt).text;spec.references=orderedRefs().map(r=>({...spec.references.find(item=>item.alias===r.alias),filename:uploads.refs.get(r)}));
    spec.frames={start:uploads.first,end:uploads.last};spec.control=currentControl();
    if(spec.control&&uploads.control_context)spec.control_context_filename=uploads.control_context;
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
    }}finally{if(epoch===state.generationEpoch||signal?.aborted){state.waitingPreparation=false;if(epoch===state.generationEpoch)await pollQueue();}}
    if(epoch!==state.generationEpoch||signal?.aborted)throw Error('Cancelled');
    // Revalidate through the same native compiler used by the graph.
    H3PromptCompiler.compilePrompt({...currentRenderSpec(),source_prompt:result.compiled_prompt,prompt_mode:'structured'});
    state.preparedContext=result;state.lastCompiledPrompt=result.compiled_prompt;state.lastBindings=result.bindings;
    $('compiledPromptDisplay').textContent=result.compiled_prompt;
    $('preparationStatus').textContent=(result.warnings||[]).join(' ')||'Prepared. This exact prompt will be sent to H3.';
    return result.compiled_prompt;
  }
  const goalNames={pose:'body motion',depth:'scene structure',canny:'outlines',gray:'lighting'};
  function preprocessorReason(kind){
    if(!goalNames[kind])return 'This goal requires an already prepared control map. Choose Prepared control map under Video input.';
    const processor=state.labCapabilities?.control_preprocessors?.[kind];
    return processor?.ready===true?'':processor?.reason||(Array.isArray(processor?.reasons)?processor.reasons.join('. '):'')||'Extraction for this goal is not configured on this server.';
  }
  function refreshControlInputs(){
    const ordinary=$('controlInputType').value==='video',kind=$('controlKind').value,masked=kind==='inpaint';
    $('maskInputs').classList.toggle('hidden',!masked);$('controlVideoInputs').classList.toggle('hidden',masked);
    $('controlVideoLabel').textContent=ordinary?'Source video':'Prepared control video';
    $('controlVideoHelp').textContent=ordinary?'Upload an ordinary video. Studio extracts the selected guidance, then fits it to the canvas and duration.':'Upload the actual control map. Studio fits it to the canvas and duration without extracting it again.';
    for(const option of $('controlKind').options){
      const reason=option.value==='inpaint'||!ordinary?'':preprocessorReason(option.value);
      option.disabled=!!reason;option.title=reason;
    }
    $('controlPreprocessorStatus').textContent=masked?'The source video is aligned without extracting another control map.':ordinary?preprocessorReason(kind)||'Extraction for '+goalNames[kind]+' is available on this server. CPU processing takes additional time; Cancel stops this request.':'Advanced input: the video must already contain the selected guidance.';
    const start=Number($('controlStartSeconds').value),span=Number($('duration').value)/24;
    $('controlSourceSpan').textContent=Number.isFinite(start)&&start>=0?'Uses '+start.toFixed(2)+'–'+(start+span).toFixed(2)+' seconds from the source at the selected output length.':'Enter a valid source start time.';
    for(const id of ['controlStartSeconds','controlInputType','controlKind','controlVideo','controlSource','controlMask','controlStrength'])$(id).disabled=!!state.busy;
  }
  function validateControl(){
    const control=currentControl();if(!control)return;
    if(!Number.isFinite(control.start_seconds)||control.start_seconds<0||control.start_seconds>3600)throw Error('Source start must be between 0 and 3600 seconds.');
    if(state.mode==='refs'||state.continuation||$('enableRefine').checked)throw Error('ControlNet requires Text or Frames without continuation or Refine.');
    if(control.kind!=='inpaint'&&control.input_type==='video'){
      const reason=preprocessorReason(control.kind);if(reason)throw Error(reason);
    }
    if(!state.controlInputs.video&&control.kind!=='inpaint')throw Error(control.input_type==='video'?'Attach a source video to extract guidance.':'Attach a prepared control video.');
    if(control.kind==='inpaint'&&(!state.controlInputs.source||!state.controlInputs.mask))throw Error('Attach a source video and a matching white/black mask.');
  }
  async function videoDuration(item){
    if(Number.isFinite(item.controlDuration))return item.controlDuration;
    const duration=await new Promise((resolve,reject)=>{
      const video=document.createElement('video'),url=URL.createObjectURL(item.file);
      const finish=(error,value)=>{clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);error?reject(error):resolve(value);};
      const timer=setTimeout(()=>finish(new Error('Cannot read the source video length. Choose a decodable video.')),15000);
      video.preload='metadata';video.onloadedmetadata=()=>{item.controlWidth=video.videoWidth;item.controlHeight=video.videoHeight;Number.isFinite(video.duration)&&video.duration>0?finish(null,video.duration):finish(new Error('Cannot verify the source video length.'));};
      video.onerror=()=>finish(new Error('Cannot read the source video.'));video.src=url;
    });
    item.controlDuration=duration;return duration;
  }
  const alignedMasks=new WeakMap();
  async function alignMask(mask,source,width,height){
    const cached=alignedMasks.get(mask);
    if(cached?.original===mask.file&&cached.width===width&&cached.height===height&&cached.sourceWidth===source.controlWidth&&cached.sourceHeight===source.controlHeight)return cached;
    const bitmap=await createImageBitmap(mask.file);
    try{
      const maskRatio=bitmap.width/bitmap.height,sourceRatio=source.controlWidth/source.controlHeight,canvasRatio=width/height;
      if(!(Math.abs(maskRatio/sourceRatio-1)<.005||Math.abs(maskRatio/canvasRatio-1)<.005))throw Error('Mask aspect must match the source video or the selected canvas. Reattach a matching mask before uploading.');
      let file=mask.file;
      if(bitmap.width!==width||bitmap.height!==height){
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const context=canvas.getContext('2d');context.imageSmoothingEnabled=false;
        const scale=Math.max(width/bitmap.width,height/bitmap.height),drawWidth=Math.ceil(bitmap.width*scale),drawHeight=Math.ceil(bitmap.height*scale);
        context.drawImage(bitmap,Math.floor((width-drawWidth)/2),Math.floor((height-drawHeight)/2),drawWidth,drawHeight);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob)throw Error('Cannot align this mask. Choose a valid PNG mask.');
        file=new File([blob],mask.file.name.replace(/\.[^.]+$/,'')+'_aligned.png',{type:'image/png'});
      }
      return {original:mask.file,file,width,height,sourceWidth:source.controlWidth,sourceHeight:source.controlHeight,fitted:file!==mask.file};
    }finally{bitmap.close();}
  }
  async function planControl(){
    const control=currentControl();if(!control)return;validateControl();
    if(control.kind!=='inpaint'&&control.input_type!=='video')return;
    const key=control.kind==='inpaint'?'source':'video',item=state.controlInputs[key],mask=state.controlInputs.mask,epoch=state.generationEpoch,width=state.width,height=state.height;
    const duration=await videoDuration(item);
    const alignedMask=control.kind==='inpaint'?await alignMask(mask,item,width,height):null;
    if(epoch!==state.generationEpoch)return;
    if(state.width!==width||state.height!==height||state.controlInputs[key]!==item||control.kind==='inpaint'&&state.controlInputs.mask!==mask||currentControl()?.kind!==control.kind||currentControl()?.input_type!==control.input_type||currentControl()?.start_seconds!==control.start_seconds)throw Error('Control inputs changed. Review them and generate again.');
    if(alignedMask){alignedMasks.set(mask,alignedMask);state.control.mask_alignment={fitted:alignedMask.fitted,width,height,method:'nearest_cover_crop'};}
    const available=Math.floor((duration-control.start_seconds)*24+.0001);
    if(available<124)throw Error('The source must contain at least 5.17 seconds after the selected start. Choose a longer span.');
    const requested=Number($('duration').value),matched=Math.min(requested,5+17*Math.floor((available-5)/17));
    state.control.source_span={start_seconds:control.start_seconds,seconds:matched/24,source_duration:duration};
    state.control.plan_note=matched<requested?'Matched output to source span: '+(matched/24).toFixed(2)+' seconds. No frames are repeated or padded.':'';
    if(matched<requested){$('durationSeconds').value=String(matched/24);syncDuration();renderEstimates();$('controlStatus').textContent=state.control.plan_note;}
    refreshControlInputs();saveDraft();
  }
  async function controlUploads(sendFile,uploads,{contextOnly=false}={}){
    const control=currentControl();if(!control)return;validateControl();
    const prepareVideo=async(item,label,options={input_type:control.input_type,kind:control.kind})=>{
      const uploaded=await sendFile(item.file,'video',label,{...item,fitVideo:control.input_type==='video'||control.kind==='inpaint',trimEnabled:true,trimStart:control.start_seconds,trimDuration:Math.min(Number($('duration').value)/24,Number.isFinite(item.controlDuration)?item.controlDuration-control.start_seconds:Infinity)});
      const requestId=crypto.randomUUID(),signal=state.abortController?.signal;
      state.controlPreparationId=requestId;let active=true,timer=null;
      const processing=options.input_type==='video';
      const statusText=processing?'Extracting '+(goalNames[options.kind]||options.kind)+' guidance from your video. CPU processing can take longer; Cancel stops this request.':'Aligning the video to the canvas and duration. Cancel stops this request.';
      $('controlStatus').textContent=statusText;setProgress(processing?'Extracting video guidance':'Aligning control video',5,null,true);
      const poll=async()=>{
        if(!active||signal?.aborted||state.controlPreparationId!==requestId)return;
        try{
          const response=await fetch(api('/h3_studio/lab/control/progress/'+encodeURIComponent(requestId)),{signal});
          if(response.ok){const progress=await response.json();if(active&&!signal?.aborted&&state.controlPreparationId===requestId){
            const done=Number(progress.processed_frames),total=Number(progress.total_frames);
            $('controlStatus').textContent=statusText+(Number.isFinite(done)&&Number.isFinite(total)&&total>0?' '+Math.max(0,Math.min(done,total))+' / '+total+' frames.':'');
          }}
        }catch{}
        if(active&&!signal?.aborted)timer=setTimeout(poll,1500);
      };
      timer=setTimeout(poll,1500);
      try{
        const response=await fetch(api('/h3_studio/lab/control/prepare'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:uploaded.name,width:state.width,height:state.height,target_frames:Number($('duration').value),...options,start_seconds:0,request_id:requestId}),signal});
        const result=await response.json();if(!response.ok)throw Error(result.error||'Control preparation failed.');
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
        state.uploads.push(result.filename);if(result.source_file)state.uploads.push(result.source_file);return result;
      }finally{active=false;clearTimeout(timer);if(state.controlPreparationId===requestId)state.controlPreparationId=null;}
    };
    if(contextOnly){
      if(control.kind!=='inpaint'&&control.input_type!=='video')return;
      const item=control.kind==='inpaint'?state.controlInputs.source:state.controlInputs.video;
      const source=await prepareVideo(item,'Prompt source evidence',{input_type:'prepared',kind:'inpaint'});
      uploads.control_context=source.filename;return;
    }
    if(control.kind!=='inpaint'){
      const result=await prepareVideo(state.controlInputs.video,control.input_type==='video'?'Source video':'Control representation');
      const {source_file:normalizedSource,...prepared}=result;
      Object.assign(control,prepared,{control_file:result.filename});uploads.control=result.filename;uploads.control_context=normalizedSource||null;
    }else{
      Object.assign(control,{fps:24,frame_count:Number($('duration').value),width:state.width,height:state.height});
      const source=await prepareVideo(state.controlInputs.source,'Source region',{input_type:'prepared',kind:'inpaint'});control.source_file=source.filename;uploads.source=source.filename;uploads.control_context=source.filename;
      const mask=state.controlInputs.mask,aligned=alignedMasks.get(mask);
      if(!aligned||aligned.original!==mask.file||aligned.width!==state.width||aligned.height!==state.height)throw Error('Control mask changed. Review the mask before generating.');
      const result=await sendFile(aligned.file,'image','Aligned control mask',{...mask,file:aligned.file,assetId:null});control.mask_file=result.name;uploads.mask=result.name;
    }
    state.control=control;$('controlStatus').textContent=(control.plan_note?control.plan_note+' ':'')+(control.kind!=='inpaint'&&control.input_type==='video'?'Guidance extracted and verified for this canvas.':'Control files aligned and verified for this canvas.');
  }
  $('preparePrompt').onclick=async()=>{
    if(state.busy||state.running)return;
    if(state.projectLoading){info("Wait for project restoration before preparing.",true);return;}
    if(state.restoreMissing?.length){info("Reattach missing project inputs before preparing.",true);return;}
    if($('preparationMode').value==='auto'&&state.promptProviderCheck)await state.promptProviderCheck;
    if(state.busy||state.running)return;
    if(!usePromptAI()){
      try {
        const result=H3PromptCompiler.compilePrompt(currentRenderSpec());
        $('compiledPromptDisplay').textContent=result.compiled_prompt;$('promptPreviewBox').open=true;
        $('preparationStatus').textContent='Formatting preview only. No AI scene analysis was used. '+result.warnings.join(' ');
      }catch(error){info(error.message,true);}
      return;
    }
    if(!state.promptProvider?.configured){info(state.promptProvider?.reason||'Configure the prompt model on this server.',true);return;}
    const epoch=++state.generationEpoch;state.started=Date.now();state.phaseEtaAt=null;setBusy(true);const previewController=new AbortController();state.abortController=previewController;const uploads={refs:new Map(),first:null,last:null};
    try{
      validateControl();
      if(currentControl())await planControl();
      if(epoch!==state.generationEpoch)throw Error('Cancelled');
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
      if(currentControl())await controlUploads(async(file,kind,label,item)=>uploadOne(file,kind,()=>{},()=>{},{resize:item.fitVideo!==false,trimEnabled:item.trimEnabled,trimStart:item.trimStart,trimDuration:item.trimDuration}),uploads,{contextOnly:true});
      if(epoch!==state.generationEpoch)throw Error('Cancelled');
      await prepare(uploads,state.abortController.signal);
      if(epoch!==state.generationEpoch){state.preparedContext=null;return;}
      setProgress('Prompt preview ready',100,null);info('Prepared prompt preview is ready. Generate prepares against the actual uploaded inputs again.');
    }catch(error){if(epoch===state.generationEpoch)info(error.message,true);}finally{if(epoch===state.generationEpoch||state.abortController===previewController){await cleanupUploads();setBusy(false);state.abortController=null;refreshAvailability();}}
  };
  function restoreControl(){
    $('enableControl').checked=!!state.control?.enabled;
    state.control.input_type=state.control?.input_type||(state.control?.kind||Object.keys(state.controlInputs||{}).length?'prepared':'video');
    $('controlInputType').value=state.control.input_type;
    $('controlStartSeconds').value=state.control?.start_seconds??0;
    $('controlKind').value=state.control?.kind||'pose';$('controlStrength').value=state.control?.strength??1;
    refreshControlInputs();
    $('controlStatus').textContent=Object.values(state.controlInputs||{}).filter(Boolean).map(item=>item.file.name).join(' · ');
  }
  window.H3ConnectedStudio={prepare,controlUploads,refreshProvider,refreshAvailability,currentControl,restoreControl,validateControl,planControl};
  $('durationSeconds').addEventListener('input',refreshControlInputs);
  refreshProvider();
})();
