/* Personal layout never changes generation values or capability visibility. */
(function(root){
  'use strict';
  const controllers=new Set();
  function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
  function mount(rail,{scope}){
    if(!rail||rail.dataset.customizable)return;rail.dataset.customizable='true';
    const stages=[...rail.querySelectorAll(':scope > .workspace-stage')],sections=stages.flatMap(stage=>[...stage.children].filter(e=>e.classList.contains('workspace-fold')));
    const stageKey=node=>node.id,sectionKey=node=>node.dataset.foldKey||node.id;
    const labels=new Map([...stages,...sections].map(node=>[node,node.querySelector(':scope > summary')?.textContent.trim()||node.id]));
    const defaults={stages:stages.map(stageKey),hiddenStages:[],sections:sections.map(node=>({key:sectionKey(node),stage:stageKey(node.parentElement),hidden:false}))};
    const key='h3studio.layout.v1.'+scope;let preferences=defaults;
    function read(){try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&Array.isArray(saved.stages)&&Array.isArray(saved.sections))return saved;}catch{}return defaults;}
    function apply(value){
      const knownStage=new Map(stages.map(node=>[stageKey(node),node])),knownSection=new Map(sections.map(node=>[sectionKey(node),node])),used=new Set();
      for(const stage of stages)stage.classList.toggle('layout-user-hidden',Array.isArray(value.hiddenStages)&&value.hiddenStages.includes(stageKey(stage)));
      for(const id of [...value.stages,...defaults.stages])if(knownStage.has(id)&&!used.has(id)){rail.append(knownStage.get(id));used.add(id);}
      used.clear();
      for(const row of [...value.sections,...defaults.sections]){
        if(!row||typeof row.key!=='string'||used.has(row.key)||!knownSection.has(row.key)||!knownStage.has(row.stage))continue;
        const node=knownSection.get(row.key),stage=knownStage.get(row.stage);stage.append(node);node.classList.toggle('layout-user-hidden',row.hidden===true);used.add(row.key);
      }
      preferences=snapshot();
    }
    function snapshot(){return {stages:[...rail.children].filter(n=>stages.includes(n)).map(stageKey),hiddenStages:stages.filter(n=>n.classList.contains('layout-user-hidden')).map(stageKey),sections:stages.flatMap(stage=>[...stage.children].filter(n=>sections.includes(n)).map(node=>({key:sectionKey(node),stage:stageKey(stage),hidden:node.classList.contains('layout-user-hidden')})))};}
    function save(){preferences=snapshot();try{localStorage.setItem(key,JSON.stringify(preferences));}catch{} }
    function move(node,offset){const parent=node.parentElement,peers=[...parent.children].filter(n=>stages.includes(node)?stages.includes(n):sections.includes(n)),target=peers[peers.indexOf(node)+offset];if(!target)return;parent.insertBefore(node,offset<0?target:target.nextSibling);save();}
    function reveal(node){let changed=false;for(const section of [...stages,...sections])if((section===node||section.contains(node))&&section.classList.contains('layout-user-hidden')){section.classList.remove('layout-user-hidden');changed=true;}if(changed)save();}
    apply(read());
    for(const stage of stages){
      const summary=stage.querySelector(':scope > summary');summary.append(root.H3Drag.handle('Move '+labels.get(stage),offset=>move(stage,offset),'layout-stage-handle'));
      root.H3Drag.attach(stage,{selector:'.workspace-fold',handle:'.layout-section-handle',group:{name:'layout-'+scope,pull:true,put:true},onCommit:()=>save(),onCancel:()=>apply(preferences)});
    }
    for(const section of sections)section.querySelector(':scope > summary')?.append(root.H3Drag.handle('Move '+labels.get(section),offset=>move(section,offset),'layout-section-handle'));
    root.H3Drag.attach(rail,{selector:'.workspace-stage',handle:'.layout-stage-handle',onCommit:()=>save(),onCancel:()=>apply(preferences)});
    const dialog=element('dialog',null,'layout-dialog');dialog.setAttribute('aria-label','Customize workspace layout');
    const heading=element('h2','Customize workspace'),description=element('p','Drag section handles to reorder. Hide sections below, or move them to another stage. Hidden settings remain active; availability still depends on the current mode.','tip'),list=element('div',null,'layout-options');
    const footer=element('div',null,'row'),reset=element('button','Reset layout','button alt smallbtn'),close=element('button','Done','button smallbtn');reset.type=close.type='button';reset.onclick=()=>{apply(defaults);save();renderOptions();};close.onclick=()=>dialog.close();footer.append(reset,close);dialog.append(heading,description,list,footer);document.body.append(dialog);
    function renderOptions(){
      list.replaceChildren();
      for(const stageId of snapshot().stages){
        const stage=stages.find(n=>stageKey(n)===stageId),stageHeading=element('h3'),stageLabel=element('label'),stageCheck=element('input');stageCheck.type='checkbox';stageCheck.checked=!stage.classList.contains('layout-user-hidden');stageCheck.dataset.layoutVisibility=stageKey(stage);stageCheck.onchange=()=>{stage.classList.toggle('layout-user-hidden',!stageCheck.checked);save();};stageLabel.append(stageCheck,document.createTextNode(labels.get(stage)));stageHeading.append(stageLabel);list.append(stageHeading);
        const stageActions=element('div',null,'layout-row');stageActions.append(element('span','Stage order'));
        for(const [name,offset] of [['Move up',-1],['Move down',1]]){const b=element('button',name,'button alt smallbtn');b.type='button';b.onclick=()=>{move(stage,offset);renderOptions();};stageActions.append(b);}list.append(stageActions);
        for(const section of [...stage.children].filter(n=>sections.includes(n))){
          const row=element('div',null,'layout-row'),label=element('label'),check=element('input');check.type='checkbox';check.checked=!section.classList.contains('layout-user-hidden');check.dataset.layoutVisibility=sectionKey(section);check.onchange=()=>{section.classList.toggle('layout-user-hidden',!check.checked);save();};label.append(check,document.createTextNode(labels.get(section)));row.append(label);
          const destination=element('select');destination.setAttribute('aria-label','Stage for '+labels.get(section));
          for(const optionStage of stages){const option=element('option',labels.get(optionStage));option.value=stageKey(optionStage);destination.append(option);}destination.value=stageId;destination.onchange=()=>{stages.find(n=>stageKey(n)===destination.value).append(section);save();renderOptions();};row.append(destination);
          for(const [name,offset] of [['↑',-1],['↓',1]]){const b=element('button',name,'button alt smallbtn');b.type='button';b.setAttribute('aria-label',(offset<0?'Move up ':'Move down ')+labels.get(section));b.onclick=()=>{move(section,offset);renderOptions();};row.append(b);}list.append(row);
        }
      }
    }
    const open=element('button','Customize layout');open.type='button';open.className='layout-customize';open.onclick=()=>{renderOptions();dialog.showModal();};
    const nav=rail.querySelector(':scope > .workspace-jumps');if(nav)nav.append(open);else rail.prepend(open);
    controllers.add({reveal});
  }
  root.H3WorkspaceLayout={mount,reveal(node){for(const controller of controllers)controller.reveal(node);}};
})(globalThis);
