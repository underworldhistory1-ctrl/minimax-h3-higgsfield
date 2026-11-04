/* Build supported combinations through the actual browser resolver and graph builder. */
const C=require('../../web/h3/configuration'),B=require('../../web/h3/graph-builder');
const singularities=['Minimax-h3_Singularity_ref2va_Pruned_v1.3_int8.safetensors','Minimax-h3_Singularity_ref2va_v1.3_int8.safetensors','Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors'];
const profiles=[{model_profile:'original'},...singularities.map(checkpoint=>({model_profile:'singularity',checkpoint})),{model_profile:'hybrid_conditioning'},...['none','block_range_adaln','all_adaln'].map(hybrid_preset=>({model_profile:'hybrid_loader',hybrid_preset}))];
const caps={refine_ready:true,audio_refine_ready:true,continuation_ready:true,controlnet_ready:true,controlnet_references_ready:true,hybrid_loader_ready:true,turbo_ready:true,turbo_ref_ready:true,guide_audio:true,guide_video:true,dials_ready:true,dial_files:['dials/motion.safetensors','dials/mood.safetensors'],model_catalog:[...singularities.map(name=>({name,profiles:['singularity']})),{name:C.FL,profiles:['hybrid_loader','hybrid_conditioning']}],sampling_options:{samplers:['res_multistep','euler','h3_turbo'],schedulers:['simple'],weight_dtypes:['default']},node_schemas:{SpectrumApplyMiniMaxH3:{input:{required:{blend_weight:['FLOAT',{min:0,max:1}]}}},MiniMaxH3MotionCache:{input:{required:{reuse_threshold:['FLOAT',{min:0,max:1}]}}}}};
const references=[{kind:'image',alias:'hero'},{kind:'image',alias:'boardA',role:'storyboard',storyboard_group:'board'},{kind:'image',alias:'boardB',role:'storyboard',storyboard_group:'board'},{kind:'video',alias:'source',fps:24,frame_count:124,use_audio:true},{kind:'audio',alias:'voice'}];
const assets={references:{hero:'hero.png',boardA:'a.png',boardB:'b.png',source:'source.mp4',voice:'voice.wav'},first:'first.png',last:'last.png'};
const guideTypes=['image','audio','video','av'];let specs=[];
function base(profile,mode,dials,canvas,guideType){
 const [width,height]=canvas,s={...profile,mode,width,height,target_frames:124,seed:'18446744073709551615',compiled_prompt:'Selected setup.',frames:mode==='frames'?{first:'first',last:'last'}:{},references:mode==='refs'?references:[],dials:dials?caps.dial_files.map((name,i)=>({name,strength:i?.25:-.5,enabled:true})):[],loras:[{name:'style.safetensors',strength:.6,refinement_strength:.4,enabled:true},{name:'Motion_Repair_V2.safetensors',strength:.8,refinement_strength:.25,enabled:true}]};
 s.guides=[{kind:guideType==='av'?'video':guideType,frame_idx:17,filename:guideType==='image'?'guide.png':guideType==='audio'?'guide.wav':'guide.mp4',fps:24,frame_count:39,use_audio:guideType==='av'}];return s;
}
function add(s){s.workflow=B.buildGraph(s,assets,caps);specs.push(s);}
for(const profile of profiles)for(const mode of ['text','frames','refs'])for(const render_method of ['native','spectrum','motioncache'])for(const pass of ['base','refine','audio','refine_audio','control','generated','imported'])for(const dials of [false,true])for(const canvas of [[1280,704],[1080,1920]]){
 if(mode==='frames'&&['generated','imported'].includes(pass))continue;
 const s={...base(profile,mode,dials,canvas,guideTypes[specs.length%4]),render_method};
 if(pass.includes('refine')){s.enable_refine=true;s.refine_scale=1.2;s.refinement={steps:7,denoise:.3,cfg:1,sampler_name:'euler',scheduler:'simple'};}
 if(['audio','refine_audio'].includes(pass))s.audio_refinement={enabled:true,steps:4,denoise:.3,sampler_name:'euler',scheduler:'simple'};
 if(pass==='control'){const c=B.canvasFor(...canvas);s.control={enabled:true,kind:'canny',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',fps:24,frame_count:124,width:c.width,height:c.height,control_file:'control.mp4',strength:.7,start_percent:.1,end_percent:.9};}
 if(['generated','imported'].includes(pass)){const c=B.canvasFor(...canvas),checkpoint=C.resolve(s,caps).checkpoint;s.continuation={type:pass,context_length:39,audio_feather_ticks:4,source_canvas:pass==='generated'?{width:c.width,height:c.height}:{width:s.width,height:s.height},...(pass==='generated'?{source_token:'owned',source_model:checkpoint}:{source_file:'source.mp4'})};}
 if(render_method==='spectrum')s.node_options={SpectrumApplyMiniMaxH3:{blend_weight:.35}};
 if(render_method==='motioncache')s.node_options={MiniMaxH3MotionCache:{reuse_threshold:.1}};
 add(s);
}
for(const [name,variant] of Object.entries(C.PIKA))for(const profile of [profiles[0],profiles[3]])for(const mode of ['text','frames','refs'])for(const dials of [false,true])for(const canvas of [[1280,704],[1080,1920]])for(const guide of guideTypes){
 if(variant.family!==(mode==='refs'?'ref2va':'fl2va')||(profile.model_profile!=='original'&&mode!=='refs'))continue;
 const s=C.normalizeSelection({...base(profile,mode,dials,canvas,guide),loras:[{name,enabled:true,strength:1}]},'pika',caps);add(s);
}
for(const mode of ['text','frames','refs'])for(const dials of [false,true])for(const canvas of [[1280,704],[1080,1920]])for(const guide of guideTypes)add({...base(profiles[0],mode,dials,canvas,guide),loras:[],render_method:mode==='refs'?'turbo_ref':'turbo',steps:mode==='refs'?8:6});
process.stdout.write(JSON.stringify({specs,caps}));
