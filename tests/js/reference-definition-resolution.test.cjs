const test=require('node:test'),assert=require('node:assert/strict');
const {compilePrompt,parseStructuredSections}=require('../../web/h3/prompt-compiler.js');
const {buildGraph}=require('../../web/h3/graph-builder.js');
const refs=[{alias:'2',asset_id:'man',kind:'image',role:'character identity'},{alias:'3',asset_id:'kitchen',kind:'image',role:'location'}];
const source='subject_definitions:\n<Subject 1> is the male character from @2. Preserve his identity. Wardrobe modification: a plain black long-sleeved pullover sweater.\n<Subject 2> is the kitchen environment from @3. @3 also defines lighting, color and textures.\nsummary:\n[reference generation] A 10-second sequence of <Subject 1> inside <Subject 2>.\nretention_analysis:\n<Subject 1>: partially_preserved - identity from @2, modified clothing.\n<Subject 2>: fully_preserved - environment from @3.\ndetailed_description:\n[Shot 1] <Subject 1> grabs sugar. [Shot 2] He pours it. [Shot 3] He stumbles. [Shot 4] One knee and one palm touch the floor.\noverall_soundscape:\nNo spoken dialogue.\nnon_diegetic_music:\nN/A';
test('User subject definitions resolve numeric aliases by actual connected image order',()=>{
 const r=compilePrompt({mode:'refs',source_prompt:source,references:refs});const sections=parseStructuredSections(r.compiled_prompt);assert.match(sections.subject_definitions,/<Subject 1> is the male character from <Picture 1>/);assert.match(sections.subject_definitions,/<Subject 2> is the kitchen environment from <Picture 2>/);assert.match(sections.subject_definitions,/plain black long-sleeved pullover sweater/);assert.doesNotMatch(r.compiled_prompt,/@[23]/);assert.match(sections.detailed_description,/One knee and one palm/);assert.deepEqual(r.bindings.map(b=>[b.alias,b.picture_idx,b.subject_idx]),[['2',1,1],['3',2,2]]);
});
test('Subject numbering in definitions overrides different image card order without swapping graph files',()=>{
 const reversed=[refs[1],refs[0]],spec={mode:'refs',source_prompt:source,references:reversed};const r=compilePrompt(spec);assert.deepEqual(r.bindings.map(b=>[b.alias,b.picture_idx,b.subject_idx]),[['3',1,2],['2',2,1]]);const g=buildGraph({...spec,compiled_prompt:r.compiled_prompt},{man:'man.png',kitchen:'kitchen.png'});assert.equal(g[g['6'].inputs['ref_images.ref_image_0'][0]].inputs.image,'kitchen.png');assert.equal(g[g['6'].inputs['ref_images.ref_image_1'][0]].inputs.image,'man.png');
});
test('Guided prose accepts native references without demanding duplicate aliases',()=>{
 const r=compilePrompt({mode:'refs',source_prompt:'<Subject 1> walks inside <Subject 2>.',references:refs});assert.match(r.compiled_prompt,/<Subject 1> is .*<Picture 1>/);assert.match(r.compiled_prompt,/<Subject 2> is .*<Picture 2>/);
});
test('Common explicit tag spelling spacing and Arabic digit variants are canonicalized',()=>{
 for(const token of ['<subject1>','< Subject_1 >','<subject ١>'])assert.match(compilePrompt({mode:'refs',source_prompt:token+' follows <pictre2>.',references:refs}).compiled_prompt,/<Subject 1> follows <Picture 2>/);
});
test('Consistent explicit Picture plus alias is preserved, contradictory mapping reports the actual image',()=>{
 assert.doesNotThrow(()=>compilePrompt({mode:'refs',source_prompt:source.replace('from @2.','in <Picture 1>, referenced as @2.'),references:refs}));assert.throws(()=>compilePrompt({mode:'refs',source_prompt:source.replace('from @2.','in <Picture 2>, referenced as @2.'),references:refs}),/Subject 1 links @2 to <Picture 1>.*conflicting/);
});
test('Multiple views can intentionally define one subject without inventing another',()=>{
 const r=compilePrompt({mode:'refs',source_prompt:'subject_definitions:\n<Subject 1> is the man in @2 and @3.\nsummary:\n<Subject 1> walks.',references:refs.map(r=>({...r,role:'character identity'}))});assert.match(r.compiled_prompt,/<Subject 1> is the man in <Picture 1> and <Picture 2>/);assert.equal(r.bindings[0].subject_idx,1);assert.equal(r.bindings[1].subject_idx,1);
});
test('Missing or out-of-range native references still fail instead of binding to a different image',()=>{
 assert.throws(()=>compilePrompt({mode:'refs',source_prompt:'@2 @3 and <subject9>.',references:refs}),/does not exist/);assert.throws(()=>compilePrompt({mode:'refs',source_prompt:'@2 @3 and <pictre9>.',references:refs}),/does not exist/);assert.throws(()=>compilePrompt({mode:'refs',source_prompt:source.replace('from @2.','from @missing.'),references:refs}),/Unknown mention/);
});

test('Negative and malformed identifiers cannot silently bind to positive image numbers',()=>{
 for(const token of ['<Subject -1>','<Picture 1a>','<Picture 1,2>'])assert.throws(()=>compilePrompt({mode:'refs',source_prompt:'@2 @3 '+token,references:refs}),/Invalid reference tag/);
});
test('Visible binding chips use explicit subject definitions instead of default card subject order',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),compiler=require('../../web/h3/prompt-compiler.js');const text=fs.readFileSync('web/studio.js','utf8'),start=text.indexOf('function mentionItems(){'),end=text.indexOf('function mentionPreview(',start);const context={state:{mode:'refs',refs:[refs[1],refs[0]]},H3PromptCompiler:compiler,currentRenderSpec:()=>({mode:'refs',source_prompt:source,references:[refs[1],refs[0]]}),orderedRefs:()=>[refs[1],refs[0]],referenceDisplay:r=>({name:r.alias}),projectCatalogItems:()=>[]};vm.createContext(context);vm.runInContext(text.slice(start,end)+';globalThis.items=mentionItems();',context);assert.equal(context.items[0].tag,'<Picture 1> → <Subject 2>');assert.equal(context.items[1].tag,'<Picture 2> → <Subject 1>');
});
