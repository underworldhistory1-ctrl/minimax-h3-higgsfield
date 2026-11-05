const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../../web/h3/prompt-compiler');
test('numeric aliases sharing a definition line bind both players after reuse renaming',()=>{
 const references=Array.from({length:9},(_,i)=>({kind:'image',alias:String(i+1),role:i>=2&&i<=4?'character identity':'object'}));
 const source='subject_definitions:\n@1 — STORYBOARD.\n@2 — LOCATION.\n@3 — VENDOR.\n@4 — PLAYER A; @5 — PLAYER B: Preserve distinct appearances.\n@6 — BALL. @7 — PADDLE. @8 — TABLE.\n@9 — STYLE.\nsummary:\n@3 passes @2 while @4 and @5 play at @8 with @6 and @7, following @1 in @9 style.\nretention_analysis:\nKeep all identities.\ndetailed_description:\nOne continuous shot.\noverall_soundscape:\nStreet.\nnon_diegetic_music:\nNone.';
 const r=C.compilePrompt({mode:'refs',source_prompt:source,references});
 for(const b of r.bindings.filter(b=>b.subject_idx))assert.match(r.compiled_prompt,new RegExp('<Subject '+b.subject_idx+'> is shown in <Picture '+b.picture_idx+'>'));
});
