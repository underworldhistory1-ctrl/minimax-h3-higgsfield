/* Offline SortableJS adapter. Inputs change only after a completed, unlocked drop. */
(function(root){
  'use strict';
  function handle(label,move,className=''){
    const button=document.createElement('button');button.type='button';button.className='drag-handle '+className;button.textContent='⠿';button.title=label+' · drag, or Alt + arrow keys';button.setAttribute('aria-label',label);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
    button.addEventListener('keydown',event=>{if(event.altKey&&['ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();move?.(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1);}});
    return button;
  }
  function attach(container,{selector,handle:grip,onCommit,onCancel,locked=()=>false,group}){
    if(!container||!root.Sortable)return null;
    container._h3Sortable?.destroy();let cancelled=false;
    const escape=event=>{if(event.key==='Escape')cancelled=true;};
    const sortable=new root.Sortable(container,{draggable:selector,handle:grip,group,animation:root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:120,fallbackOnBody:true,fallbackTolerance:5,delay:140,delayOnTouchOnly:true,ghostClass:'drag-placeholder',chosenClass:'drag-chosen',preventOnFilter:false,
      onMove:()=>!locked(),onChoose:()=>{cancelled=false;},onStart:()=>{document.addEventListener('keydown',escape,true);},
      onEnd:event=>{document.removeEventListener('keydown',escape,true);if(locked()||cancelled){onCancel?.();return;}try{onCommit?.(event);}catch(error){onCancel?.();throw error;}}
    });
    const destroy=sortable.destroy.bind(sortable);sortable.destroy=()=>{document.removeEventListener('keydown',escape,true);destroy();if(container._h3Sortable===sortable)delete container._h3Sortable;};container._h3Sortable=sortable;return sortable;
  }
  function destroyTree(container){for(const element of [container,...container.querySelectorAll('*')])element._h3Sortable?.destroy();}
  root.H3Drag={handle,attach,destroyTree};
})(globalThis);
