const {test}=require('node:test');const assert=require('node:assert/strict');
const defaults=require('../../web/h3/project-settings.js');
test('fresh project settings inherit only controls from the latest completed take',()=>{
 const draft={mode:'refs',prompts:{refs:'current'},refs:[{assetId:'current'}],guides:[{assetId:'guide'}],configuration:{sampling:{cfg:1}}};
 const source={mode:'text',prompts:{text:'old'},refs:[{assetId:'old'}],control:{enabled:true},continuation:{token:'old'},settings:{steps:8,seed:'42'},loras:[{name:'adapter',enabled:true}],canvas:{width:1280,height:704},configuration:{sampling:{cfg:2},preserveReferenceAudio:true,preserveAudioSource:'old'},enableRefine:true};
 const project={project_id:'a',takes:[{output_file:'a.mp4',created_at:2,status:'completed',draft:source},{output_file:'b.mp4',created_at:1,draft:{settings:{steps:20}}},{created_at:3,status:'failed',draft:{settings:{steps:99}}}]};
 const result=defaults.inherit(draft,project);
 assert.deepEqual(result.refs,draft.refs);assert.deepEqual(result.prompts,draft.prompts);assert.deepEqual(result.guides,draft.guides);assert.equal(result.mode,'text');assert.equal(result.continuation,undefined);assert.equal(result.control,undefined);assert.equal(result.settings.steps,8);assert.equal(result.loras[0].name,'adapter');assert.equal(result.configuration.preserveReferenceAudio,false);
 result.loras[0].name='changed';assert.equal(source.loras[0].name,'adapter');
 assert.equal(defaults.inherit(draft,{project_id:'b',takes:[]}),draft);
 assert.equal(defaults.inherit({...draft,reuse_source:{take_id:'old'}},project).settings,undefined);
});
