(function (root) {
  'use strict';
  function mentionNodes(container, value) {
    container.replaceChildren();
    const text = String(value || '');
    const pattern = /@[\p{L}\p{N}_-]+/gu;
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      container.append(document.createTextNode(text.slice(start, match.index)));
      const span = document.createElement('span'); span.className = 'reference-mention'; span.textContent = match[0];
      container.append(span); start = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(start)));
  }
  function attachPrompt(textarea) {
    if (!textarea || textarea.parentElement.classList.contains('prompt-editor')) return;
    const wrapper = document.createElement('div'); wrapper.className = 'prompt-editor';
    textarea.before(wrapper); wrapper.append(textarea);
    const mirror = document.createElement('div'); mirror.className = 'prompt-highlight'; mirror.setAttribute('aria-hidden', 'true');
    wrapper.prepend(mirror);
    const sync = () => {
      mentionNodes(mirror, textarea.value + '\n');
      mirror.scrollTop = textarea.scrollTop; mirror.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener('input', sync); textarea.addEventListener('scroll', sync);
    textarea.addEventListener('compositionstart', () => wrapper.classList.add('composing'));
    textarea.addEventListener('compositionend', () => { wrapper.classList.remove('composing'); sync(); });
    new ResizeObserver(() => { mirror.style.height = textarea.clientHeight + 'px'; mirror.style.width = textarea.clientWidth + 'px'; sync(); }).observe(textarea);
    // Draft restoration and mention insertion assign .value without an input event.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(textarea, 'value', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); sync(); } });
    const setRangeText = textarea.setRangeText;
    textarea.setRangeText = function (...args) { const result = setRangeText.apply(this, args); sync(); return result; };
    sync();
  }
  function captureThumbnail(item) {
    if (item.thumbnail) return item.thumbnail;
    const url = item.previewUrl || item.url;
    if (!url || item.kind === 'audio') return null;
    const image = [...document.querySelectorAll('img,video')].find(node => node.src === url && (node.naturalWidth || node.videoWidth));
    if (!image) return null;
    try {
      const width = image.naturalWidth || image.videoWidth, height = image.naturalHeight || image.videoHeight;
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * height / width));
      if (canvas.height > 160) { canvas.height = 160; canvas.width = Math.max(1, Math.round(160 * width / height)); }
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .7);
    } catch { return null; }
  }
  function referenceCards(container, references, assetUrl) {
    const list = document.createElement('div'); list.className = 'detail-references';
    for (const ref of references) {
      const card = document.createElement('div'); card.className = 'detail-reference';
      const snapshot = typeof ref.thumbnail === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ref.thumbnail) && ref.thumbnail.length < 60000 ? ref.thumbnail : null;
      const source = snapshot || (ref.asset_id && ref.type === 'image' ? assetUrl(ref.asset_id) : null);
      const preview = document.createElement('div'); preview.className = 'detail-reference-preview';
      preview.textContent = ref.type === 'audio' ? 'Audio' : 'Unavailable';
      if (source) {
        const img = document.createElement('img'); img.src = source; img.alt = ref.name || 'Reference'; img.loading = 'lazy';
        img.onerror = () => { preview.textContent = 'Unavailable'; card.classList.add('missing'); };
        preview.replaceChildren(img);
      } else if (ref.type !== 'audio') card.classList.add('missing');
      const label = document.createElement('div'); mentionNodes(label, ref.name || ref.file || 'Reference');
      const role = document.createElement('small'); role.textContent = [ref.type, ref.use_as, ref.video_soundtrack ? 'soundtrack on' : null].filter(Boolean).join(' · ');
      const status = document.createElement('small'); status.textContent = source ? (snapshot ? 'Saved preview' : 'Project asset') : ref.type === 'audio' ? 'Audio reference' : 'Historical preview unavailable';
      label.append(role, status); card.append(preview, label); list.append(card);
    }
    container.append(list);
  }
  function revealControl(node){
    for(let parent=node?.parentElement;parent;parent=parent.parentElement)
      if(parent.tagName==='DETAILS'&&!parent.querySelector(':scope > summary')?.contains(node))parent.open=true;
  }
  function arrangeWorkspace() {
    const rail = document.querySelector('.sidebar-scroll');
    if (!rail || !document.getElementById('modelConfiguration') || rail.dataset.arranged) return;
    rail.dataset.arranged = 'true';
    const panels = [...rail.children];
    const panelFor = id => document.getElementById(id)?.closest('.panel');
    const prompt = panelFor('prompt');
    const generation = panelFor('renderMethod');
    const refinement = panelFor('enableRefine');
    const loras = panelFor('loraList');
    const advanced = panelFor('seed');
    const groups = [
      ['workspace','Workspace','Scene, projects & reusable assets',false,[['scene','Scene workspace',document.getElementById('projectPanel'),true],['scenes','Scenes & shots',document.getElementById('scenesPanel'),false]]],
      ['shot','Shot inputs','Mode, references & prompt',true,[['mode','Generation mode',rail.querySelector('.modes'),true],['frames','Start & end frames',document.getElementById('framesSection'),true],['references','References',document.getElementById('refsSection'),true],['prompt','Prompt',prompt,true],['preparation','Prompt preparation',document.getElementById('preparationPanel'),false]]],
      ['render','Render setup','Quality, model & adapters',true,[['generation','Output & sampling',generation,true],['model','Model configuration',document.getElementById('modelConfiguration'),false],['loras','LoRAs',loras,false],['refinement','Generative refinement',refinement,false]]],
      ['guidance','Optional guidance','Continuation, keyframes & controls',false,[['source','Continue a video',document.getElementById('sourcePanel'),false],['continuation','Active continuation',document.getElementById('continuationPanel'),true],['keyframes','Temporal keyframes',document.getElementById('guidesPanel'),false],['control','Motion & region control',document.getElementById('controlPanel'),false],['advanced','Advanced settings',advanced,false]]]
    ];
    const used=new Set(),nav=document.createElement('nav');nav.className='workspace-jumps';nav.setAttribute('aria-label','Production sections');
    function saved(id,fallback){try{const v=sessionStorage.getItem('h3studio.fold.'+id);return v===null?fallback:v==='open';}catch{return fallback;}}
    function remember(fold){fold.addEventListener('toggle',event=>{if(event.target!==fold)return;try{sessionStorage.setItem('h3studio.fold.'+fold.id,fold.open?'open':'closed');}catch{}});}
    function details(id,title,description,open,className){const d=document.createElement('details');d.id='fold-'+id;d.className=className;d.open=saved(d.id,open);const s=document.createElement('summary'),t=document.createElement('strong');t.textContent=title;s.append(t);if(description){const hint=document.createElement('span');hint.textContent=description;s.append(hint);}d.append(s);remember(d);return d;}
    for(const [id,title,description,open,items] of groups){
      const stage=details(id,title,description,open,'workspace-stage');
      const jump=document.createElement('button');jump.type='button';jump.textContent=title;jump.onclick=()=>{stage.open=true;stage.scrollIntoView({block:'start'});stage.querySelector('summary').focus();};nav.append(jump);
      for(const [key,label,node,expanded] of items){
        if(!node)continue;used.add(node);
        const fold=details(key+'-section',label,'',expanded,'workspace-fold');
        if(node.tagName==='DETAILS'){
          // Keep the real details element: other modules set .open to reveal it.
          const old=node.querySelector(':scope > summary');if(!old)node.prepend(fold.querySelector('summary'));node.classList.add('workspace-fold');node.open=fold.open;node.dataset.foldKey=fold.id;
          node.addEventListener('toggle',event=>{if(event.target===node)try{sessionStorage.setItem('h3studio.fold.'+node.dataset.foldKey,node.open?'open':'closed');}catch{}});
          stage.append(node);
        }else{
          fold.append(node);stage.append(fold);
          // Visibility stays owned by mode/capability code on the original node.
          const sync=()=>{fold.hidden=node.hidden||node.classList.contains('hidden');};sync();new MutationObserver(sync).observe(node,{attributes:true,attributeFilter:['hidden','class']});
        }
      }
      if(id==='workspace'){
        const assets=document.createElement('button');assets.type='button';assets.className='button alt smallbtn';assets.textContent='Open reusable assets';assets.onclick=()=>Promise.resolve(root.navigateWorkspace?.('elements')).catch(error=>root.info?.(error.message,true));stage.append(assets);
      }
      rail.append(stage);
    }
    const collapse=document.createElement('button');collapse.type='button';collapse.textContent='Collapse all';collapse.onclick=()=>{for(const stage of rail.querySelectorAll('.workspace-stage'))stage.open=false;rail.scrollTop=0;};nav.append(collapse);rail.prepend(nav);
    for(const node of panels)if(!used.has(node))node.classList.add('workspace-intro');
    rail.addEventListener('focusin',event=>revealControl(event.target));
    const error=document.getElementById('error');if(error)new MutationObserver(()=>{if(error.textContent&&!error.hidden&&!error.classList.contains('hidden'))revealControl(error);}).observe(error,{attributes:true,childList:true,subtree:true});
  }
  root.H3StudioUX = { mentionNodes, attachPrompt, captureThumbnail, referenceCards, arrangeWorkspace, revealControl };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    attachPrompt(document.getElementById('prompt')); arrangeWorkspace();
    const refresh=document.getElementById('brandRefresh');
    if(refresh)refresh.onclick=async()=>{
      refresh.disabled=true;
      try{
        if(root.H3VideoTabState)await root.H3VideoTabState.prepareReload();
        if(root.QwenTabState)await root.QwenTabState.prepareReload();
        root.saveDraft?.();root.saveSession?.();root.location.reload();
      }catch(error){refresh.disabled=false;const message='Could not save this tab before refresh: '+error.message;if(root.info)root.info(message,true);else root.showError?.(message);}
    };
  });
})(globalThis);
