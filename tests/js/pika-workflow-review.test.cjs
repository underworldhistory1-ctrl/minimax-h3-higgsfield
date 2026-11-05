const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../../web/h3/configuration'),Compiler=require('../../web/h3/prompt-compiler'),Builder=require('../../web/h3/graph-builder');
const hd='pika_h3_flex_turbo_8step_hd_ref2va.safetensors';
test('profile picker resolves installed Singularity v2 before reconciling active Pika',async()=>{
 const source=fs.readFileSync('web/h3/configuration-ui.js','utf8'),checkpoint='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors';
 const fields={modelProfile:{value:'singularity'},checkpoint:{}};
 const ctx={state:{mode:'refs',modelProfile:'original',checkpoint:C.REF,loras:[{name:hd,enabled:true,strength:1}],sampling:C.pikaSampling(C.pikaVariant(hd)),steps:8,labCapabilities:{model_catalog:[{name:'legacy.safetensors',profiles:['singularity']},{name:checkpoint,profiles:['singularity']}]}},H3Configuration:C,$:id=>fields[id],info(){},changed(){},updateCapabilities(){},refresh:async()=>{},applySelection(action){const next=C.normalizeSelection({mode:ctx.state.mode,model_profile:ctx.state.modelProfile,checkpoint:ctx.state.checkpoint,loras:ctx.state.loras,sampling:ctx.state.sampling,steps:8},action,ctx.state.labCapabilities);ctx.state.loras=next.loras;}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf("$('modelProfile').onchange="),source.indexOf("$('checkpoint').onchange=")),ctx);
 fields.modelProfile.onchange();await Promise.resolve();
 assert.equal(ctx.state.checkpoint,checkpoint);assert.equal(ctx.state.loras[0].enabled,true);
});
test('Pika reference order survives interleaved media and paired soundtrack numbering',()=>{
 const references=[{kind:'video',alias:'move',role:'motion',use_audio:true,fps:24,frame_count:124,duration:124/24},{kind:'image',alias:'board',role:'storyboard'},{kind:'audio',alias:'voice',role:'voice',duration:3},{kind:'image',alias:'hero',role:'character identity'}];
 const spec=C.normalizeSelection({mode:'refs',source_prompt:'@hero follows @board with @move and @voice.',target_frames:124,references,loras:[{name:hd,enabled:true}]},'pika');
 const prompt=Compiler.compilePrompt(spec),g=Builder.buildGraph({...spec,compiled_prompt:prompt.compiled_prompt},{board:'board.png',hero:'hero.png',move:'move.mp4',voice:'voice.wav'},{sampling_options:{samplers:['euler'],schedulers:['simple'],weight_dtypes:['default']}});
 assert.deepEqual(prompt.bindings.map(b=>[b.alias,b.tag,b.paired_audio_tag]),[['board','<Picture 1>',undefined],['hero','<Subject 1>',undefined],['move','<Video 1>','<Audio 1>'],['voice','<Audio 2>',undefined]]);
 for(const [slot,file] of [[0,'board.png'],[1,'hero.png']])assert.equal(g[g['6'].inputs['ref_images.ref_image_'+slot][0]].inputs.image,file);
 assert.match(prompt.compiled_prompt,/<Subject 1> is the character identity shown in <Picture 2>/);
 assert.ok(g['6'].inputs['ref_video_audios.ref_video_audio_0']);assert.ok(g['6'].inputs['ref_audios.ref_audio_0']);
 assert.equal(Object.values(g).some(n=>n.inputs.first_frame||n.class_type==='MiniMaxH3AddGuide'),false);
});
test('real adapter handler reports removed choices and keeps reference media intact',()=>{
 const source=fs.readFileSync('web/studio.js','utf8'),fields={steps:{value:'20'},renderMethod:{value:'native'},enableRefine:{checked:true},enableControl:{checked:true},selectionChanges:{}};
 const style={name:'style.safetensors',enabled:true},pika={name:hd,enabled:false};
 const refs=[{alias:'hero',kind:'image',assetId:'saved'}];
 const ctx={state:{mode:'refs',modelProfile:'original',sampling:{},loras:[style,pika],refs,control:{enabled:true},audioRefinement:{enabled:true}},H3Configuration:C,$:id=>fields[id],method:()=>fields.renderMethod.value,refreshSelectionAvailability(){},info(){},turboMethod:()=>false,window:{}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('function restorePikaSampling()'),source.indexOf('function loraModeCompatible(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function preservedSoundtrack()'),source.indexOf('function refreshSelectionAvailability()')),ctx);
 vm.runInContext(source.slice(source.indexOf('function applyAdapterSelection('),source.indexOf('function renderLoras()')),ctx);
 ctx.applyAdapterSelection(pika,true);
 assert.equal(fields.steps.value,'8');assert.equal(style.enabled,false);assert.equal(ctx.state.refs,refs);
 assert.match(fields.selectionChanges.textContent,/Disabled adapters: style/);assert.match(fields.selectionChanges.textContent,/Disabled image refinement/);assert.match(fields.selectionChanges.textContent,/Disabled ControlNet/);assert.match(fields.selectionChanges.textContent,/Disabled audio enhancement/);
 assert.match(C.pikaWorkflow(ctx.selectionSpec()).title,/8-step HD.*References/);
 ctx.applyAdapterSelection(pika,false);assert.equal(fields.steps.value,'20');assert.equal(C.pikaWorkflow(ctx.selectionSpec()),null);
 ctx.applyAdapterSelection(pika,true);fields.renderMethod.value='spectrum';
 ctx.applySelection('method');assert.equal(pika.enabled,false);assert.match(fields.selectionChanges.textContent,/Disabled adapters: pika/);assert.equal(fields.selectionChanges.hidden,false);
});
test('long compiled Pika prompts are reported without changing content or blocking local inference',()=>{
 const spec={loras:[{name:hd,enabled:true}]},source='x'.repeat(8001),before=JSON.stringify(spec);
 assert.match(C.pikaPromptWarnings(spec,source)[0],/8,001.*8,000/);
 assert.equal(source.length,8001);assert.equal(JSON.stringify(spec),before);
 assert.deepEqual(C.pikaPromptWarnings(spec,'x'.repeat(8000)),[]);
 assert.deepEqual(C.pikaPromptWarnings({loras:[]},source),[]);
 assert.match(C.pikaWorkflow({loras:[{name:hd,strength:1}]}).title,/Pika Flex Turbo/);
});
test('Singularity prompt guidance reports actual compiled size without replacing saved choices',()=>{
 const legacy='legacy.safetensors',caps={model_catalog:[{name:legacy,profiles:['singularity']},{name:C.SINGULARITY_V2,profiles:['singularity']}]};
 assert.equal(C.preferredCheckpoint('singularity',caps),C.SINGULARITY_V2);
 assert.equal(C.preferredCheckpoint('singularity',caps,legacy),legacy);
 const spec={model_profile:'singularity',checkpoint:C.SINGULARITY_V2,loras:[]},prompt='x'.repeat(5001);
 const notes=C.promptQualityWarnings(spec,prompt,['Structured prompt controls retention and instructions directly; reference card roles, panel order and instructions are bypassed. Attached media tags are still validated.']);
 assert.equal(notes.length,2);assert.match(notes[0],/5,001.*5,000/);assert.match(notes[1],/bypassed/);assert.equal(prompt.length,5001);
 assert.deepEqual(C.promptQualityWarnings({...spec,checkpoint:legacy},prompt),[]);
});
