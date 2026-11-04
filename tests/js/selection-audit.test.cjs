const {test}=require('node:test'),assert=require('node:assert/strict');const C=require('../../web/h3/configuration'),B=require('../../web/h3/graph-builder');
test('source soundtrack reuse is validated before uploads and clears on interactive mode change',()=>{
 const spec={mode:'refs',preserve_reference_audio:'second',references:[{kind:'video',alias:'first',use_audio:false},{kind:'video',alias:'second',use_audio:true}]};
 assert.doesNotThrow(()=>C.resolve(spec));
 for(const patch of [{mode:'text'},{mode:'frames'},{references:[]},{references:[{kind:'video',alias:'second',use_audio:false}]}])assert.throws(()=>C.resolve({...spec,...patch}),/soundtrack|References/);
 assert.equal(C.normalizeSelection({...spec,mode:'text'},'mode').preserve_reference_audio,null);
 assert.equal(C.normalizeSelection({...spec,mode:'text'},'restore').preserve_reference_audio,'second');
});
test('source alias distinguishes differently trimmed cards sharing one saved asset',()=>{
 const references=['first','second'].map(alias=>({kind:'video',alias,asset_id:'shared',fps:24,frame_count:124,use_audio:true}));
 const g=B.buildGraph({mode:'refs',references,preserve_reference_audio:'second'},{first:'a.mp4',second:'b.mp4'});
 assert.deepEqual(g['11'].inputs.audio,g['6'].inputs['ref_video_audios.ref_video_audio_1']);
 assert.throws(()=>C.resolve({mode:'refs',references,preserve_reference_audio:'shared'}),/source|ambiguous/i);
});
test('family-marked adapters use the same gate at selection and graph resolution',()=>{
 for(const [name,mode] of [['custom_ref2va.safetensors','text'],['custom_fl2va.safetensors','refs']]){
  assert.equal(C.loraModeCompatible(name,mode),false);assert.throws(()=>C.resolve({mode,loras:[{name,enabled:true}]}),/LoRA.*mode|LoRA.*family/i);
 }
 for(const name of ['ordinary_style.safetensors','shared_fl2va_ref2va.safetensors'])for(const mode of ['text','frames','refs'])assert.equal(C.loraModeCompatible(name,mode),true);
});
test('reference names source, mask and control cannot collide with actual control inputs',()=>{
 const references=['source','mask','control'].map(alias=>({kind:'image',alias})),files=Object.fromEntries(references.map(r=>[r.alias,r.alias+'.png']));
 const g=B.buildGraph({mode:'refs',references,control:{enabled:true,kind:'canny',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',fps:24,frame_count:124,width:1280,height:704,control_file:'actual-control.mp4'}},{references:files},{controlnet_ready:true,controlnet_references_ready:true});
 for(let i=0;i<references.length;i++)assert.equal(g[g['6'].inputs['ref_images.ref_image_'+i][0]].inputs.image,references[i].alias+'.png');
 const apply=Object.values(g).find(n=>n.class_type==='MiniMaxH3FunControlNetApply');assert.equal(apply.inputs.mask,undefined);assert.equal(apply.inputs.source_video,undefined);const split=g[apply.inputs.control_video[0]];assert.equal(g[split.inputs.video[0]].inputs.file,'actual-control.mp4');
});
