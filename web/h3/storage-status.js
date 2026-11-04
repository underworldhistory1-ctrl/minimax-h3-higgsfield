(function(){
  'use strict';
  const panel=document.getElementById('storageStatus');if(!panel)return;
  let pending=false;
  const size=n=>(n/1024**3).toLocaleString('en',{maximumFractionDigits:1})+' GiB';
  async function refresh(){
    if(pending||document.visibilityState==='hidden')return;pending=true;
    try{
      const response=await fetch(api('/h3_studio/lab/storage'),{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('Unavailable');const data=await response.json();
      if(!Number.isFinite(data.free_bytes)||!Number.isFinite(data.total_bytes)||data.total_bytes<=0)throw Error('Unavailable');
      document.getElementById('storageFree').textContent=size(data.free_bytes)+' free';
      document.getElementById('storageDetails').textContent='Server output disk: '+size(data.free_bytes)+' free of '+size(data.total_bytes)+'. Models on other disks are not included.';
      panel.dataset.low=String(data.free_bytes/data.total_bytes<.1);
    }catch{
      document.getElementById('storageFree').textContent='unavailable';
      document.getElementById('storageDetails').textContent='Server output disk information is temporarily unavailable.';
    }finally{pending=false;}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
  addEventListener('visibilitychange',refresh);setInterval(refresh,60000);refresh();
})();
