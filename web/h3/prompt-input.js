/* Loss-preserving user input adapter. Parsing changes syntax, never asset bindings. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/prompt-parsers.js'));
  else root.H3PromptInput = factory(root.H3PromptParsers);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(parsers) {
  'use strict';
  const aliases = {
    subject_definitions: ['subject definitions', 'تعريفات الشخصيات', 'تعريف الشخصيات'],
    summary: ['summary', 'ملخص', 'الملخص'],
    retention_analysis: ['retention analysis', 'تحليل الاحتفاظ'],
    detailed_description: ['detailed description', 'description', 'scene description', 'الوصف التفصيلي', 'وصف المشهد', 'الوصف'],
    integrated_multimodal_description: ['integrated multimodal description', 'الوصف المتكامل'],
    overall_soundscape: ['overall soundscape', 'soundscape', 'sound', 'audio', 'الصوت', 'المشهد الصوتي'],
    non_diegetic_music: ['non diegetic music', 'music', 'الموسيقى', 'موسيقى'],
  };
  const key = value => String(value).normalize('NFKC').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const names = new Map();
  for (const [name, values] of Object.entries(aliases)) for (const value of [name, ...values]) names.set(key(value), name);
  const canonical = value => names.get(key(value));
  const blocked = new Set(['__proto__', 'constructor', 'prototype']);
  function checkTree(node, children) {
    const stack = [[node, 0]]; let count = 0;
    while (stack.length) {
      const [current, depth] = stack.pop();
      if (++count > 4000 || depth > 24) throw Error('Input structure is too complex to normalize.');
      for (const child of children(current)) stack.push([child, depth + 1]);
    }
  }
  function readJson(source) {
    const errors = [];
    const tree = parsers.parseTree(source, errors, {allowTrailingComma:true, disallowComments:false});
    if (!tree || errors.length) throw Error('Incomplete JSON.');
    checkTree(tree, node => {
      if (node.type === 'number' && (!Number.isFinite(node.value) || !Number.isSafeInteger(node.value) && Number.isInteger(node.value))) throw Error('Unsafe numeric precision.');
      if (node.type === 'object') {
        const seen = new Set();
        for (const prop of node.children || []) {
          const name = prop.children[0].value;
          if (seen.has(name) || blocked.has(name)) throw Error('Ambiguous JSON keys.');
          seen.add(name);
        }
      }
      return node.children || [];
    });
    const comments = [];
    parsers.visit(source, {onComment: (offset,length) => comments.push(source.slice(offset,offset+length))});
    return {data:parsers.getNodeValue(tree), comments};
  }
  function readYaml(source) {
    const doc = parsers.parseDocument(source, {schema:'failsafe', uniqueKeys:true, stringKeys:true, prettyErrors:false});
    if (doc.errors.length || doc.warnings.length) throw Error('Ambiguous YAML.');
    const comments = [doc.commentBefore, doc.comment].filter(Boolean);
    checkTree(doc.contents, node => {
      if (node?.commentBefore) comments.push(node.commentBefore);
      if (node?.comment) comments.push(node.comment);
      if (parsers.isAlias(node)) throw Error('YAML aliases are retained as source text.');
      if (parsers.isMap(node)) {
        for (const pair of node.items) if (blocked.has(String(pair.key?.value))) throw Error('Unsafe YAML key.');
        return node.items.flatMap(pair => [pair.key, pair.value]).filter(Boolean);
      }
      return parsers.isSeq(node) ? node.items.filter(Boolean) : [];
    });
    return {data:doc.toJS({maxAliasCount:0}), comments};
  }
  function readable(value, depth = 0) {
    if (value === null) return 'null';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) return value.map(item => readable(item, depth + 1)).join('\n\n');
    return Object.entries(value).map(([name, body]) => name + ':\n' + readable(body, depth + 1)).join('\n\n');
  }
  function fromData(data) {
    if (typeof data === 'string') return {detailed_description:data};
    if (!data || typeof data !== 'object') throw Error('No prompt object.');
    const fields = Object.create(null), extra = [];
    const add = (name, body) => { fields[name] = [fields[name], readable(body)].filter(Boolean).join('\n\n'); };
    for (const [name, body] of Object.entries(data)) {
      const field = canonical(name);
      if (field) add(field, body);
      else if (['prompt','sections','h3_prompt','video_prompt'].includes(name) && body && typeof body === 'object' && !Array.isArray(body)) {
        for (const [nested, value] of Object.entries(fromData(body))) add(nested,value);
      } else if (['prompt','h3_prompt','video_prompt'].includes(name) && typeof body === 'string') extra.push(body);
      else extra.push(name + ':\n' + readable(body));
    }
    if (extra.length) add('detailed_description', extra.join('\n\n'));
    return fields;
  }
  function normalizeHeadings(source) {
    // Recognize entire heading lines only. Ordinary prose and dialogue stay intact.
    return source.split('\n').map(line => {
      const match = line.match(/^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*|__)?([^:：\n]+?)(?:\*\*|__)?[ \t]*(?:[:：][ \t]*(?:\*\*|__)?[ \t]*(.*))?$/);
      if (!match) return line;
      const name = canonical(match[1]);
      return name ? name + ':' + (match[2] ? ' ' + match[2] : '') : line;
    }).join('\n');
  }
  function normalize(input) {
    const original = typeof input === 'string' ? input : '';
    let text = original.replace(/^\uFEFF/, '').replace(/\r\n?/g,'\n').trim();
    const warnings = []; let format = 'text', sections = null, ambiguous = false;
    // Remove only a complete outer fence, not code or dialogue embedded in a scene.
    const fence = text.match(/^```([\w-]*)[^\S\n]*\n([\s\S]*?)\n```$/);
    const language = fence?.[1]?.toLowerCase();
    if (fence) { text = fence[2].trim(); warnings.push('Outer code fence removed.'); }
    if (text.length <= 24000 && parsers) {
      const json = /^(?:\{|\[\s*(?:[\[{"\d\]-]|true\b|false\b|null\b))/.test(text);
      const yaml = ['yaml','yml'].includes(language) || /^(?:[^\n:]+):[ \t]*[|>][-+]?\s*$/m.test(text);
      if (json || yaml) {
        try {
          const parsed = json ? readJson(text) : readYaml(text);
          sections = fromData(parsed.data);
          if (parsed.comments.length) sections.detailed_description = [sections.detailed_description, 'Additional source comments:\n'+parsed.comments.join('\n')].filter(Boolean).join('\n\n');
          text = Object.entries(sections).map(([name,body]) => name+':\n'+body).join('\n\n');
          format = json ? 'jsonc' : 'yaml';
        }
        catch { ambiguous = true; sections = null; warnings.push('Structured input kept verbatim because automatic conversion was ambiguous.'); }
      }
    }
    const normalized = sections || ambiguous ? text : normalizeHeadings(text);
    if (normalized !== text) warnings.push('Section headings normalized without changing the scene text.');
    return {text:normalized, original_text:original, sections, opaque:ambiguous, format, warnings};
  }
  return {normalize, canonical};
});
