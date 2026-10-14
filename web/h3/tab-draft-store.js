/* Per-tab metadata; immutable IndexedDB media with active-use leases. */
(function(root){
  'use strict';
  let database;const ids=new WeakMap(),MAX_BYTES=1024*1024*1024,TTL=7*86400000;
  function open(){
    if(!database)database=new Promise((resolve,reject)=>{
      const r=indexedDB.open('h3-tab-media',2);
      r.onupgradeneeded=()=>{for(const name of ['files','leases'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};
      r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();database=null;};resolve(r.result);};
      r.onerror=()=>{database=null;reject(r.error);};
      r.onblocked=()=>{database=null;reject(Error('Close outdated Studio tabs to unlock draft storage.'));};
    });
    return database;
  }
  async function transaction(mode,operation){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(['files','leases'],mode);let result;try{result=operation(t.objectStore('files'),t.objectStore('leases'),t);}catch(e){t.abort();reject(e);return;}t.oncomplete=()=>resolve(result?.result);t.onerror=t.onabort=()=>reject(t.failure||t.error||Error('Draft media storage failed.'));});}
  async function cleanup(protectedIds=new Set()){
    return transaction('readwrite',(files,leases)=>{const r=files.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;const l=leases.get(c.key);l.onsuccess=()=>{if((l.result||c.value.at)<Date.now()-TTL&&!protectedIds.has(c.key)){c.delete();leases.delete(c.key);}c.continue();};};});
  }
  const key=name=>'h3.tab.setup.'+name;
  async function save(name,snapshot){
    const files=new Map(),fresh=[];
    function encode(value){
      if(value instanceof Blob){let id=ids.get(value);if(!id){id=crypto.randomUUID();ids.set(value,id);fresh.push(value);}files.set(id,value);return {__h3_file:id};}
      if(Array.isArray(value))return value.map(encode);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['url','previewUrl','originalPreviewUrl'].includes(k)).map(([k,v])=>[k,encode(v)]));
      return value;
    }
    const json=JSON.stringify(encode(snapshot));
    try{
      if(files.size){
        if(fresh.length)await cleanup(new Set(files.keys()));
        await transaction('readwrite',(store,leases,t)=>{
          let bytes=0;const seen=new Set(),r=store.openCursor();
          r.onsuccess=()=>{const c=r.result;if(c){bytes+=c.value.file?.size||0;seen.add(c.key);c.continue();return;}
            for(const [id,file]of files)if(!seen.has(id))bytes+=file.size;
            if(bytes>MAX_BYTES){t.failure=Error('Browser draft media limit reached (1 GB). Save the project to its server before closing this tab.');t.abort();return;}
            for(const [id,file]of files){if(!seen.has(id))store.put({file,at:Date.now()},id);leases.put(Date.now(),id);}
          };
        });
      }
      sessionStorage.setItem(key(name),json);
      return json;
    }catch(e){for(const file of fresh)ids.delete(file);throw e;}
  }
  async function load(name){
    const json=sessionStorage.getItem(key(name));if(!json)return null;
    async function decode(value){
      if(value?.__h3_file){const row=await transaction('readwrite',(files,leases)=>{leases.put(Date.now(),value.__h3_file);return files.get(value.__h3_file);});if(!row?.file)throw Error('A draft file is no longer in browser storage. Save or reattach project materials before resetting this setup.');ids.set(row.file,value.__h3_file);return row.file;}
      if(Array.isArray(value))return Promise.all(value.map(decode));
      if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await decode(v)])));
      return value;
    }
    return decode(JSON.parse(json));
  }
  function remove(name){sessionStorage.removeItem(key(name));}
  root.H3TabDraftStore={save,load,remove,cleanup};
})(globalThis);
