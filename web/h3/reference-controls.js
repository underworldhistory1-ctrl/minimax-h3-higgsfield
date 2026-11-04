/* Reference-only controls. Original media stays owned by its input descriptor. */
(function(root){
  'use strict';
  function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
  function addFields(card,ref,refs,locked,changed){
    if(ref.kind==='image'){
      if(H3ReferencePolicy.canGroup(ref)||ref.subject_group){
        const label=element('label','REFERENCE GROUP'),select=element('select');select.className='ref-subject-group';select.setAttribute('aria-label','Reference group for @'+ref.alias);select.disabled=locked;
        const add=(value,title)=>{const o=element('option',title);o.value=value;select.append(o);};add('','Separate reference');
        const groups=[...new Set(refs.filter(r=>H3ReferencePolicy.groupKey(r)&&r.role===ref.role).map(r=>r.subject_group))];
        for(const group of groups){const members=refs.filter(r=>r.subject_group===group&&r.role===ref.role);add(group,'Same '+(H3ReferencePolicy.groupRoles[ref.role]||'reference').toLowerCase()+': '+members.map(r=>'@'+r.alias).join(', '));}
        const valid=ref.subject_group==null||ref.subject_group===''||!!H3ReferencePolicy.groupKey(ref)&&!refs.some(r=>r!==ref&&r.subject_group===ref.subject_group&&r.role!==ref.role);
        if(!valid){add('__invalid','Invalid stored group — clear or select again');card.append(element('p','This stored group is invalid or mixes roles. Clear it or choose a group with the same image role.','ref-policy-error'));}
        if(H3ReferencePolicy.canGroup(ref))add('__new','Create a '+H3ReferencePolicy.groupRoles[ref.role].toLowerCase()+' group');select.value=valid?(ref.subject_group||''):'__invalid';
        select.onchange=()=>{if(select.value==='__invalid')return;ref.subject_group=select.value==='__new'?'character_'+crypto.randomUUID().replaceAll('-',''):select.value;changed(true);};
        card.append(label,select,element('p','Group alternate views of the same subject. Mention any member once to include every view. Each image keeps its own instruction. Native structured subject definitions keep authority.','tip'));
      }
      const label=element('label'),check=element('input');check.type='checkbox';check.className='ref-original-resolution';check.checked=ref.useOriginalResolution===true;check.disabled=locked;check.onchange=()=>{ref.useOriginalResolution=check.checked;changed(false);};
      label.append(check,document.createTextNode(' Use original resolution before native sizing'));card.append(label,element('p','Bypasses Auto-fit 2048 for this image. Your selected image fit and H3 native sizing still apply. The original file is retained; this does not guarantee more model detail.','tip'));
      const sizing=H3ReferencePolicy.sizingText(ref.meta);if(sizing)card.append(element('p',sizing,'ref-sizing tip'));
    }
    if(ref.role==='storyboard')addInstruction('PANEL ORDER / SHOT MAP (OPTIONAL)','panelOrder','e.g. left to right, top to bottom');
    addInstruction('ADDITIONAL INSTRUCTION (OPTIONAL)','instruction','e.g. retain the scar; use only the camera movement');
    card.append(element('p','Guided prompts include this instruction. Complete structured prompts keep their own instructions.','tip'));
    function addInstruction(title,key,placeholder){const label=element('label',title),input=element('textarea');input.rows=2;input.className='ref-additional-instruction';input.setAttribute('aria-label',title+' for @'+ref.alias);input.placeholder=placeholder;input.value=ref[key]||'';input.disabled=locked;input.oninput=()=>{ref[key]=input.value;changed(false);};card.append(label,input);}
  }
  function addPreview(card,ref,onMetadata){
    if(!['video','audio'].includes(ref.kind))return;
    const wrap=element('div',null,'ref-segment-preview'),label=element('div','Expand to preview the selected source segment.','ref-segment-label tip');wrap.append(label);card.append(wrap);
    let media=null,frame=null,disposed=false;
    const range=()=>H3ReferencePolicy.previewRange(ref,media?.duration||ref.localDuration||ref.meta?.source_duration);
    function update(){const r=range();label.textContent=r?'Source preview: '+r.start.toFixed(2)+'–'+r.end.toFixed(2)+' s · '+r.duration.toFixed(2)+' s selected. Native preparation may align the uploaded span.':media?'Waiting for source duration, or invalid selected range.':'Expand to preview the selected source segment.';if(media&&r&&(media.currentTime<r.start||media.currentTime>=r.end)){media.pause();media.currentTime=r.start;}}
    function tick(){frame=null;if(!media||disposed)return;const r=range();if(!r||media.currentTime>=r.end){media.pause();if(r)media.currentTime=r.end;return;}if(!media.paused)frame=requestAnimationFrame(tick);}
    function mount(){if(disposed||media||!card.open)return;if(!ref.previewUrl&&ref.file)ref.previewUrl=URL.createObjectURL(ref.file);const url=ref.previewUrl||ref.url;if(!url)return;
      media=element(ref.kind);media.controls=true;media.preload='metadata';media.className='ref-source-player';media.setAttribute('aria-label','Selected '+ref.kind+' segment for @'+ref.alias);if(ref.kind==='video')media.playsInline=true;
      media.addEventListener('loadedmetadata',()=>{if(disposed)return;if(Number.isFinite(media.duration)){ref.localDuration=media.duration;onMetadata?.();}update();});
      media.addEventListener('play',()=>{const r=range();if(!r){media.pause();return;}if(media.currentTime<r.start||media.currentTime>=r.end)media.currentTime=r.start;if(frame===null)frame=requestAnimationFrame(tick);});
      media.addEventListener('timeupdate',()=>{const r=range();if(r&&!media.paused&&media.currentTime>=r.end){media.pause();media.currentTime=r.end;}});
      media.addEventListener('seeking',()=>{const r=range();if(r&&media.currentTime<r.start)media.currentTime=r.start;if(r&&media.currentTime>r.end)media.currentTime=r.end;});
      media.src=url;wrap.append(media);update();
    }
    const toggle=()=>{if(card.open)mount();else media?.pause();};card.addEventListener('toggle',toggle);card.referencePreview={update,mount,dispose(){disposed=true;card.removeEventListener('toggle',toggle);if(frame!==null)cancelAnimationFrame(frame);if(media){media.pause();media.removeAttribute('src');media.load();media.remove();}}};mount();
  }
  function cleanup(container){for(const card of container.querySelectorAll('.compact-ref'))card.referencePreview?.dispose();for(const media of container.querySelectorAll('video,audio')){media.pause();media.removeAttribute('src');media.load();}}
  function groupContainer(container,ref,refs,locked,insert,addImages){
    const key=H3ReferencePolicy.groupKey(ref);if(!key)return container;
    let group=[...container.children].find(e=>e.dataset.referenceGroup===key);if(group)return group.querySelector('.reference-group-views');
    const members=refs.filter(r=>H3ReferencePolicy.groupKey(r)===key);
    group=element('section',null,'reference-group');group.dataset.referenceGroup=key;
    const header=element('div',null,'reference-group-heading'),title=element('strong',H3ReferencePolicy.groupRoles[ref.role]+' · @'+members[0].alias);
    const mention=element('button','Insert @'+members[0].alias,'button alt smallbtn');mention.type='button';mention.disabled=locked;mention.onclick=()=>insert(members[0].alias);
    const add=element('button','+ Add views','button alt smallbtn');add.type='button';add.disabled=locked;add.onclick=()=>addImages(ref);
    header.append(title,mention,add);group.append(header,element('p',members.length+' view'+(members.length===1?'':'s')+' · each image stays connected','tip'));
    const views=element('div',null,'reference-group-views');group.append(views);container.append(group);return views;
  }
  root.H3ReferenceControls={addFields,addPreview,cleanup,groupContainer};
})(globalThis);
