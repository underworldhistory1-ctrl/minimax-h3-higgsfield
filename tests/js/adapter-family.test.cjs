const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
test('H3 adapter discovery excludes Qwen image adapters while retaining installed H3 styles',async()=>{
 const source=fs.readFileSync('web/studio.js','utf8');
 const names=['H3_Combat_V2.safetensors','qwen21/NSFW-Qwen-by-TheseAlpacas-V2.safetensors','QWEN21\\other.safetensors','Motion_Repair_V2.safetensors'];
 const c={state:{loras:[]},fetch:async()=>({ok:true}),api:p=>p,H3RenderValues:{readJson:async()=>({items:names})},turboName:'turbo',updateMethodAvailability(){},renderLoras(){},renderEstimates(){}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function loadLoras()'),source.indexOf('$("refreshLoras").onclick')),c);await c.loadLoras();
 assert.equal(c.state.lorasLoaded,true);assert.deepEqual(Array.from(c.state.loras,l=>l.name),['H3_Combat_V2.safetensors','Motion_Repair_V2.safetensors']);
});
