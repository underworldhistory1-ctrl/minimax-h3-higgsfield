const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compilePrompt,parseStructuredSections}=require('../../web/h3/prompt-compiler.js');
const {buildGraph}=require('../../web/h3/graph-builder.js');

const roles={
  image:['character identity','custom','storyboard','location','visual style','object'],
  video:['motion','custom','motion and camera','camera movement','action','whole scene'],
  audio:['voice','custom','music','sound effects'],
};
for(const [kind,choices] of Object.entries(roles))for(const role of choices){
  test(`${kind} UI role '${role}' binds its prompt tag to the resolved native media input`,()=>{
    const file={image:'owned_image.png',video:'owned_video.mp4',audio:'owned_audio.wav'}[kind];
    const instruction=role==='custom'?'Use only the requested lighting or performance attribute; replace the original subject.':role==='storyboard'?'Read panels left to right; do not show panel borders.':'';
    const reference={asset_id:'owned_asset',alias:'evidence',kind,role,instruction,
      ...(kind==='video'?{fps:24,frame_count:150,duration:150/24,use_audio:false}:{}),
      ...(kind==='audio'?{duration:2}:{}),...(role==='storyboard'?{panel_order:'Panel A, then panel B'}:{})};
    const spec={mode:'refs',prompt_mode:'guided',source_prompt:'Apply @evidence only according to its selected role.',width:1280,height:704,target_frames:124,references:[reference]};
    const compiled=compilePrompt(spec),binding=compiled.bindings[0];
    const sections=parseStructuredSections(compiled.compiled_prompt);
    assert.equal(binding.alias,'evidence');assert.equal(binding.kind,kind);assert.equal(binding.role,role);
    assert.equal(binding.instruction,instruction);
    const tag=kind==='image'?['custom','storyboard'].includes(role)?'<Picture 1>':'<Subject 1>':kind==='video'?'<Video 1>':'<Audio 1>';
    assert.equal(binding.tag,tag);assert.ok(compiled.compiled_prompt.includes(tag));
    assert.ok(!compiled.compiled_prompt.includes('@evidence'),'Only the native tag enters the model prompt');
    if(instruction)assert.ok(compiled.compiled_prompt.includes(instruction));
    if(kind==='image'){
      assert.equal(binding.picture_idx,1);
      if(tag==='<Subject 1>')assert.match(compiled.compiled_prompt,/<Subject 1>[^\n]*<Picture 1>/);
      if(role==='visual style')assert.match(compiled.compiled_prompt,/attribute_transfer/);
      if(role==='custom')assert.doesNotMatch(compiled.compiled_prompt,/fully_preserved/);
      if(['character identity','location','object'].includes(role)){
        assert.ok(sections.subject_definitions.includes(`is the ${role} shown in <Picture 1>`));
        assert.match(sections.retention_analysis,/<Subject 1>: fully_preserved/);
      }
      if(role==='storyboard'){
        assert.match(sections.summary,/Panel A, then panel B/);
        assert.match(sections.retention_analysis,/guide shot order, framing and visual progression/);
        assert.match(sections.summary,/do not render panel borders or labels/);
      }
    }
    if(kind==='video'){
      assert.equal(binding.fps,24);assert.equal(binding.source_frames,150);assert.equal(binding.used_frames,124);
      assert.equal(binding.used_seconds,124/24);
      if(role==='custom')assert.doesNotMatch(compiled.compiled_prompt,/Preserve the motion and sound/);
      const transfer={motion:'motion only','motion and camera':'body performance, action timing and camera movement only','camera movement':'camera movement only',action:'action only','whole scene':'action, camera movement, composition and timing; explicit replacements take priority'}[role];
      if(transfer){
        assert.ok(sections.retention_analysis.includes(`<Video 1>: attribute_transfer - ${transfer}.`));
        assert.doesNotMatch(sections.retention_analysis,/fully_preserved/);
      }
      if(role==='whole scene'){
        assert.match(sections.summary,/subjects and setting only where the detailed_description does not replace them/);
        assert.match(sections.summary,/Generate a new video rather than treating reference frames as locked pixels/);
      }else if(role!=='custom')assert.match(sections.summary,/Do not transfer its actor identity, wardrobe, voice or location/);
    }
    if(kind==='audio'){
      const transfer={voice:'voice qualities only',music:'music only','sound effects':'sound effects only'}[role];
      if(transfer){
        assert.ok(sections.retention_analysis.includes(`<Audio 1>: attribute_transfer - ${transfer}.`));
        assert.doesNotMatch(sections.retention_analysis,/fully_preserved/);
        assert.ok(sections.summary.includes(`<Audio 1> is a ${role} reference.`));
      }
    }
    const graph=buildGraph({...spec,compiled_prompt:compiled.compiled_prompt},{owned_asset:file});
    assert.equal(graph['6'].class_type,'MiniMaxH3ReferenceToVideo');
    assert.equal(graph['6'].inputs.prompt,compiled.compiled_prompt);
    if(kind==='image'){
      const link=graph['6'].inputs['ref_images.ref_image_0'];assert.ok(link);
      assert.equal(graph[link[0]].class_type,'LoadImage');assert.equal(graph[link[0]].inputs.image,file);
    }else if(kind==='video'){
      const link=graph['6'].inputs['ref_videos.ref_video_0'];assert.ok(link);
      const crop=graph[link[0]];assert.equal(crop.class_type,'ImageFromBatch');assert.equal(crop.inputs.length,124);
      const split=graph[crop.inputs.image[0]];assert.equal(split.class_type,'GetVideoComponents');
      const load=graph[split.inputs.video[0]];assert.equal(load.class_type,'LoadVideo');assert.equal(load.inputs.file,file);
      assert.equal(graph['6'].inputs['ref_video_audios.ref_video_audio_0'],undefined,'Unchecked soundtrack remains disconnected');
      assert.throws(()=>buildGraph({...spec,references:[{...reference,fps:30}]},{owned_asset:file}),/24 fps/);
    }else{
      const link=graph['6'].inputs['ref_audios.ref_audio_0'];assert.ok(link);
      assert.equal(graph[link[0]].class_type,'LoadAudio');assert.equal(graph[link[0]].inputs.audio,file);
    }
  });
}
