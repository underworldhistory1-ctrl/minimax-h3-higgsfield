const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalize}=require('../../web/h3/prompt-input.js');
const {compilePrompt}=require('../../web/h3/prompt-compiler.js');

test('JSONC comments, trailing commas, unknown fields and timing all survive',()=>{
  const input=`{ // no extra actors
    "summary":"@hero enters.",
    "description":"[Shot 1] At 00:03.700 stop.",
    "dialogue":"<d>[Arabic] \u0623\u0647\u0644\u0627</d>",
    "music":"No music.",
  }`;
  const normalized=normalize(input);
  assert.equal(normalized.format,'jsonc');
  assert.equal(normalized.original_text,input);
  const result=compilePrompt({mode:'refs',source_prompt:input,references:[{alias:'hero',kind:'image',role:'character identity'}]});
  for(const value of ['no extra actors','00:03.700','<d>[Arabic] \u0623\u0647\u0644\u0627</d>','No music.','<Subject 1> enters.']) assert.ok(result.compiled_prompt.includes(value));
});

test('YAML multiline values and nested unknown instructions preserve content',()=>{
  const result=normalize('```yaml\n\u0627\u0644\u0648\u0635\u0641: |\n  @hero stands.\n  STYLE: natural.\n\u0627\u0644\u0645\u0648\u0633\u064a\u0642\u0649: No music.\nconstraints:\n  dialogue: "No speaking"\n```');
  assert.equal(result.format,'yaml');
  assert.match(result.sections.detailed_description,/@hero stands/);
  assert.match(result.sections.detailed_description,/No speaking/);
  assert.equal(result.sections.non_diegetic_music,'No music.');
});

test('scalar scene text is never reclassified as audio or a native field',()=>{
  const description='The sign says:\nmusic: Never stop.\nnon_diegetic_music: Literal text on the sign.';
  const source_prompt=JSON.stringify({description,music:'No music.'});
  const parsed=normalize(source_prompt);
  assert.equal(parsed.sections.detailed_description,description);
  assert.equal(parsed.sections.non_diegetic_music,'No music.');
  for(const mode of ['text','frames','refs']){
    const prompt=mode==='refs'?JSON.stringify({description:description+' @hero',music:'No music.'}):source_prompt;
    const result=compilePrompt({mode,source_prompt:prompt,frames:{first:'a'},references:[{alias:'hero',kind:'image',role:'character identity'}]});
    assert.ok(result.compiled_prompt.includes(description));
    assert.ok(result.compiled_prompt.endsWith('No music.'));
  }
});

test('ambiguous, duplicate, unsafe and incomplete structures stay verbatim',()=>{
  const sources=['{"description":"first","description":"second"}', '{"id":12345678901234567890,"description":"exact"}', '{"description":"unfinished', '```yaml\ndescription: |\n  Keep this.\ndescription: Other.\n```', '```yaml\ndescription: &x [*x]\n```','```yaml\ndescription: !!js/function "()=>alert(1)"\n```','{"__proto__":{"admin":true},"description":"unchanged"}'];
  for(const source of sources){
    const result=normalize(source);
    const raw=source.startsWith('```')?source.split('\n').slice(1,-1).join('\n'):source;
    assert.equal(result.text,raw);
    assert.equal(result.opaque,true);
    assert.ok(result.warnings.length);
    assert.ok(compilePrompt({mode:'text',source_prompt:source}).compiled_prompt.includes(raw));
  }
  assert.equal({}.admin,undefined);
});

test('Arabic/English headings, outer fences and plain shot prompts work without a provider',()=>{
  for(const source of ['```text\n## \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u062a\u0641\u0635\u064a\u0644\u064a\n@hero \u064a\u0645\u0634\u064a.\n\u0627\u0644\u0635\u0648\u062a: \u062e\u0637\u0648\u0627\u062a.\n\u0627\u0644\u0645\u0648\u0633\u064a\u0642\u0649: \u0628\u062f\u0648\u0646 \u0645\u0648\u0633\u064a\u0642\u0649.\n```','**Scene Description:**\n@hero \u064a\u0645\u0634\u064a.\nSound: \u062e\u0637\u0648\u0627\u062a.\nMusic: \u0628\u062f\u0648\u0646 \u0645\u0648\u0633\u064a\u0642\u0649.']){
    const result=compilePrompt({mode:'refs',source_prompt:source,references:[{alias:'hero',kind:'image',role:'character identity'}]});
    assert.match(result.compiled_prompt,/<Subject 1> \u064a\u0645\u0634\u064a/);
    assert.match(result.compiled_prompt,/\u0628\u062f\u0648\u0646 \u0645\u0648\u0633\u064a\u0642\u0649/);
  }
  const plain=compilePrompt({mode:'frames',frames:{first:'a'},source_prompt:'[Shot 1] Walk. [Shot 2] Stop.'});
  assert.match(plain.compiled_prompt,/Begin with <Picture 1>/);
  assert.equal(normalize('[Shot 1] Walk.').format,'text');
});

test('input data never creates an uploaded asset binding',()=>{
  assert.throws(()=>compilePrompt({mode:'refs',source_prompt:'{"description":"Use @ghost", "references":["ghost.png"]}',references:[]}),/Add at least one reference|Unknown mention/);
});
