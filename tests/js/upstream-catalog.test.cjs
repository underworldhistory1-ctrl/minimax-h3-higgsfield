const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../../web/h3/configuration');
test('Pika Draft and Lite are managed variants with exact family and step count',()=>{
 for(const [name,steps,family] of [
  ['pika_h3_flex_turbo_2step_draft_ref2va.safetensors',2,'ref2va'],
  ['pika_h3_flex_turbo_4step_fl2va_lite_r32.safetensors',4,'fl2va'],
  ['pika_h3_flex_turbo_4step_ref2va_lite_r32.safetensors',4,'ref2va']]){
  const variant=C.pikaVariant(name);assert.equal(variant?.steps,steps);assert.equal(variant.family,family);
  const s=C.normalizeSelection({mode:family==='ref2va'?'refs':'text',steps:20,loras:[{name,enabled:true,strength:.5}]},'pika');
  assert.equal(s.steps,steps);assert.equal(s.loras[0].strength,1);assert.equal(s.render_method,'native');C.validatePika(s);
 }
});
test('Pika mode changes retain Lite instead of silently selecting full weights',()=>{
 const names=['pika_h3_flex_turbo_4step_fl2va_lite_r32.safetensors','pika_h3_flex_turbo_4step_ref2va.safetensors','pika_h3_flex_turbo_4step_ref2va_lite_r32.safetensors'];
 const s=C.normalizeSelection({mode:'refs',loras:names.map((name,i)=>({name,enabled:i===0}))},'mode');
 assert.deepEqual(s.loras.filter(x=>x.enabled).map(x=>x.name),[names[2]]);
 const draft=C.normalizeSelection({mode:'text',loras:[{name:'pika_h3_flex_turbo_2step_draft_ref2va.safetensors',enabled:true}]},'mode');assert.equal(draft.loras[0].enabled,false);
});
test('Character Swap supports both releases and preserves an explicit legacy selection',()=>{
 const old={name:C.CHARACTER_SWAP,enabled:false},next={name:'h3_character_swap_v1.5.safetensors',enabled:false};
 assert.ok(C.isCharacterSwap(next.name));assert.ok(C.isCharacterSwap('folder/'+old.name));
 assert.equal(C.preferredCharacterSwap([old,next]),next);old.enabled=true;assert.equal(C.preferredCharacterSwap([old,next]),old);
 assert.throws(()=>C.validateCharacterSwap({mode:'text',loras:[{...next,enabled:true}]}),/References|Ref2VA/);
});
test('Pika References retains the explicitly selected Singularity v2 checkpoint',()=>{
 const checkpoint='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors';
 const s=C.normalizeSelection({mode:'refs',model_profile:'singularity',checkpoint,loras:[{name:'pika_h3_flex_turbo_4step_ref2va.safetensors',enabled:true}]},'pika');
 assert.equal(s.model_profile,'singularity');assert.equal(s.checkpoint,checkpoint);C.validatePika(s);
 assert.throws(()=>C.validatePika({...s,checkpoint:'unknown.safetensors'}),/Pika Flex/);
});
test('actual Studio selection passes the checkpoint through Pika reconciliation',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('web/studio.js','utf8');
 const checkpoint='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors';
 const state={mode:'refs',modelProfile:'singularity',checkpoint,sampling:{},loras:[{name:'pika_h3_flex_turbo_4step_ref2va_lite_r32.safetensors',enabled:true,strength:1}]};
 const fields={steps:{value:'20'},renderMethod:{value:'native'},enableRefine:{checked:false},enableControl:{checked:false}};
 const ctx={state,H3Configuration:C,$:id=>fields[id],method:()=>fields.renderMethod.value,selectedPika:()=>state.loras.find(x=>x.enabled&&C.pikaVariant(x.name)),refreshSelectionAvailability(){},info(){}};
 vm.runInNewContext(source.slice(source.indexOf('function preservedSoundtrack()'),source.indexOf('function refreshSelectionAvailability()')),ctx);
 ctx.applySelection('pika');assert.equal(state.modelProfile,'singularity');assert.equal(state.checkpoint,checkpoint);assert.equal(fields.steps.value,'4');
});
test('selecting a Character Swap version replaces the other version and retains unrelated adapters',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),source=fs.readFileSync('web/studio.js','utf8');
 const old={name:C.CHARACTER_SWAP,enabled:true},next={name:'h3_character_swap_v1.5.safetensors',enabled:false},style={name:'style.safetensors',enabled:true,strength:.3};
 const ctx={state:{loras:[old,next,style]},selectionSpec:()=>({loras:[old,next,style]}),H3Configuration:C,selectedPika:()=>false,turboMethod:()=>false,applySelection(){}};
 vm.runInNewContext(source.slice(source.indexOf('function applyAdapterSelection('),source.indexOf('function renderLoras()')),ctx);
 ctx.applyAdapterSelection(next,true);assert.equal(old.enabled,false);assert.equal(next.enabled,true);assert.equal(style.enabled,true);assert.equal(style.strength,.3);
 assert.throws(()=>C.validateCharacterSwap({mode:'refs',loras:[{...old,enabled:true},next]}),/one Character Swap version/);
});
