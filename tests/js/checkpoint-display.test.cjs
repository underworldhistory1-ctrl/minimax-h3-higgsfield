const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../web/h3/configuration-ui.js'),'utf8');
const start=source.indexOf("    const select=$('checkpoint');");const end=source.indexOf('\n    select.disabled=',start);
function display(mode,saved){
 const select={value:'',children:[],replaceChildren(){this.children=[];},append(o){this.children.push(o);}};
 const ctx={state:{mode,checkpoint:saved},profile:'original',modelFL:'fl2va.safetensors',modelRef:'ref2va.safetensors',caps:{},$:()=>select,document:{createElement:()=>({})}};
 vm.runInNewContext(source.slice(start,end),ctx);return {select,state:ctx.state};
}
test('References displays its actual native Ref2VA checkpoint after restoring a text project',()=>{
 const result=display('refs','fl2va.safetensors');assert.equal(result.select.value,'ref2va.safetensors');assert.equal(result.state.checkpoint,'ref2va.safetensors');
});
test('Text and Frames display FL2VA after restoring a reference project',()=>{
 for(const mode of ['text','frames']){const result=display(mode,'ref2va.safetensors');assert.equal(result.select.value,'fl2va.safetensors');assert.equal(result.state.checkpoint,'fl2va.safetensors');}
});
