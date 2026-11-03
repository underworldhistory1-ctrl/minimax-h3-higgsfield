/* Studio controls for the independently installed, pinned ComfyUI-Dials pack. */
(function(){
  'use strict';
  state.dials=state.dials||[];
  const panel=document.createElement('details');panel.id='dialsPanel';
  const heading=document.createElement('summary');heading.textContent='Dials · motion & mood steering';panel.append(heading);
  const notice=document.createElement('div');notice.className='tip';notice.id='dialsNotice';panel.append(notice);
  const list=document.createElement('div');list.id='dialsList';panel.append(list);$('modelConfiguration').append(panel);
  const clear=document.createElement('button');clear.type='button';clear.className='button alt small';clear.textContent='Clear Dials';clear.onclick=()=>{state.dials=[];changed();refresh();};panel.append(clear);
  function changed(){saveDraft();updatePreviewLive();renderEstimates();}
  function refresh(){
    const caps=state.labCapabilities||{},ready=!!caps.dials_ready;
    clear.disabled=state.busy||state.projectLoading;
    if(!Array.isArray(state.dials)||state.dials.some(d=>!d||typeof d.name!=='string')){list.replaceChildren();notice.textContent='Saved Dial settings are malformed. Use Clear Dials to reset this section.';return;}
    notice.textContent=ready?'Training-free steering, applied after your LoRAs. Start near ±0.5; 0 has no effect. Motion changes movement; mood dials change tone. Stacking can interact. Quality and speed require GPU review.':'Run the launcher with --matlow to prepare MAINodes, Dials and the small publisher dial library. Saved selections remain visible until the runtime is available.';
    const names=[...new Set([...(caps.dial_files||[]),...state.dials.map(d=>d.name)])];
    names.sort((a,b)=>Number(!a.endsWith('/h3_motion.safetensors'))-Number(!b.endsWith('/h3_motion.safetensors'))||a.localeCompare(b));
    list.replaceChildren();
    for(const name of names){
      const saved=state.dials.find(d=>d.name===name),available=ready&&(caps.dial_files||[]).includes(name);
      const row=document.createElement('div');row.className='ref';row.dataset.dial=name;
      const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!!saved?.enabled;
      toggle.disabled=state.busy||state.projectLoading||!available&&!toggle.checked;
      const short=name.replaceAll('\\','/').split('/').pop().replace('.safetensors','');
      label.append(toggle,document.createTextNode(' '+(short==='h3_motion'?'Motion · still ↔ energetic':short.replaceAll('_',' '))));row.append(label);
      const strength=document.createElement('input');strength.type='number';strength.min='-20';strength.max='20';strength.step='.05';strength.value=String(saved?.strength??.5);strength.setAttribute('aria-label','Dial strength '+short);strength.disabled=state.busy||state.projectLoading||!available||!toggle.checked;
      function commit(){let entry=state.dials.find(d=>d.name===name);if(!entry){entry={name,strength:.5,enabled:false};state.dials.push(entry);}entry.enabled=toggle.checked;entry.strength=Number(strength.value);changed();}
      toggle.onchange=()=>{commit();refresh();};strength.onchange=()=>{if(!strength.checkValidity()){strength.reportValidity();strength.value=String(state.dials.find(d=>d.name===name)?.strength??.5);return;}commit();};row.append(strength);
      if(!available){const warning=document.createElement('div');warning.className='tip error';warning.textContent='This saved Dial is unavailable. Install it or uncheck it to continue.';row.append(warning);}
      list.append(row);
    }
  }
  window.H3DialsUI={refresh};refresh();
})();
