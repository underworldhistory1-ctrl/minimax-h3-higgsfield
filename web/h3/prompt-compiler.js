/**
 * H3 Studio Lab — Deterministic Reference & Prompt Compiler
 *
 * Compiles user prompts and reference definitions into native MiniMax H3 tags
 * (<Picture N>, <Subject N>, <Video N>, <Audio N>) and structural sections.
 *
 * Key guarantees:
 * - Deterministic, pure function without DOM coupling.
 * - 'Custom' role compiles neutral media tags without forcing identity preservation.
 * - Structured prompts are parsed, validated, and never wrapped twice.
 * - Numerical tags remain stable and separate picture vs subject indexing.
 * - Preserves dialogue, timing, and music decisions verbatim.
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H3PromptCompiler = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const NATIVE_REF_SECTIONS = [
    'subject_definitions',
    'summary',
    'retention_analysis',
    'detailed_description',
    'overall_soundscape',
    'non_diegetic_music',
  ];

  const NATIVE_TEXT_SECTIONS = [
    'integrated_multimodal_description',
    'overall_soundscape',
    'non_diegetic_music',
  ];

  function validateLimits(references = []) {
    if (references.length > 12) {
      throw new Error('H3 accepts at most 12 reference files.');
    }
    if (references.some(r => !['image', 'video', 'audio'].includes(r.kind))) throw new Error('Unknown reference kind.');
    const images = references.filter(r => r.kind === 'image');
    if (images.length > 9) {
      throw new Error('H3 accepts at most 9 reference images.');
    }
    const videos = references.filter(r => r.kind === 'video');
    if (videos.length > 3) {
      throw new Error('H3 accepts at most 3 reference videos.');
    }
    const audios = references.filter(r => r.kind === 'audio' || (r.kind === 'video' && r.use_audio));
    if (audios.length > 3) {
      throw new Error('H3 accepts at most three audio references, including video soundtracks.');
    }
    const totalVideoSecs = videos.reduce((acc, v) => acc + (Number(v.duration || v.local_duration) || 0), 0);
    if (totalVideoSecs > 15.1) {
      throw new Error(`Video references total ${totalVideoSecs.toFixed(2)} seconds. H3 allows 15 seconds combined; trim and retry.`);
    }
  }

  function parseStructuredSections(prompt, tolerant = false) {
    // Scene headings such as STYLE and CAMERA belong to the description.
    const names = [...new Set([...NATIVE_REF_SECTIONS, ...NATIVE_TEXT_SECTIONS])];
    const pattern = names.map(name => name.split('_').join('[ _-]+')).join('|');
    const sectionRegex = tolerant
      ? new RegExp('^[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\*\\*)?(' + pattern + ')(?:\\*\\*)?[ \\t]*(?:[:：][ \\t]*(?:\\*\\*)?[ \\t]*|$)', 'gim')
      : new RegExp('^(' + names.join('|') + '):[ \\t]*', 'gim');
    const matches = [...prompt.matchAll(sectionRegex)];
    if (!matches.length) return null;

    const sections = {};
    const seen = new Set();
    const duplicates = [];

    for (let i = 0; i < matches.length; i++) {
      const name = matches[i][1].toLowerCase().replace(/[ -]+/g, '_');
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
      const startIdx = matches[i].index + matches[i][0].length;
      const endIdx = i + 1 < matches.length ? matches[i + 1].index : prompt.length;
      const body = prompt.slice(startIdx, endIdx).trim();
      sections[name] = tolerant && sections[name] ? sections[name] + '\n\n' + body : body;
    }

    if (duplicates.length && !tolerant) {
      throw new Error(`Duplicate section(s) in structured prompt: ${[...new Set(duplicates)].join(', ')}`);
    }
    if (tolerant && matches[0].index > 0) {
      const preamble = prompt.slice(0, matches[0].index).trim();
      if (preamble) {
        const field = sections.integrated_multimodal_description !== undefined
          ? 'integrated_multimodal_description' : 'detailed_description';
        sections[field] = [preamble, sections[field]].filter(Boolean).join('\n\n');
      }
    }
    return sections;
  }

  function serializeSections(sections, names) {
    return names.map(name => name + ':\n' + sections[name]).join('\n\n');
  }

  function completeSections(sections, names, defaults) {
    return Object.fromEntries(names.map(name => [name, sections[name] || defaults[name]]));
  }

  function orderedReferences(references = []) {
    const images = references.filter(r => r.kind === 'image');
    const videos = references.filter(r => r.kind === 'video');
    const audios = references.filter(r => r.kind === 'audio');
    return [...images, ...videos, ...audios];
  }

  function validateSubjectBindings(prompt, sections = parseStructuredSections(prompt), bindings = []) {
    const used = [...prompt.matchAll(/<Subject\s+(\d+)>/gi)].map(match => Number(match[1]));
    const definitions = sections?.subject_definitions || '';
    const imageCount = bindings.filter(binding => binding.kind === 'image').length;
    for (const index of new Set(used)) {
      const lines = definitions.split(/\n/).filter(line => new RegExp(`<Subject\\s+${index}>`, 'i').test(line));
      const pictures = lines.flatMap(line => [...line.matchAll(/<Picture\s+(\d+)>/gi)].map(match => Number(match[1])));
      if (index < 1 || !pictures.length || pictures.some(picture => picture < 1 || picture > imageCount)) {
        throw new Error(`Subject ${index} must be defined with a connected Picture in subject_definitions.`);
      }
      const bound = bindings.find(binding => binding.subject_idx === index);
      if (bound && !pictures.includes(bound.picture_idx)) throw new Error(`Subject ${index} definition conflicts with its attached image binding.`);
    }
  }

  function referenceVideoSpan(ref, targetFrames) {
    if (Number(ref.fps) !== 24) throw new Error('Reference video requires verified canonical 24 fps metadata.');
    const frames = Number(ref.frame_count ?? ref.duration_frames);
    if (!Number.isInteger(frames) || frames < 5) throw new Error('Reference video requires a verified frame count of at least 5.');
    const used = Math.min(frames, targetFrames);
    return { source_frames: frames, used_frames: 5 + 17 * Math.floor((used - 5) / 17), fps: 24 };
  }

  function validateNativeBindings(prompt, counts) {
    for (const match of prompt.matchAll(/<(Picture|Video|Audio|Subject)\s+(\d+)>/gi)) {
      const kind = match[1].toLowerCase(), index = Number(match[2]);
      if (index < 1 || index > (counts[kind] || 0)) throw new Error('Referenced <' + match[1] + ' ' + index + '> does not exist.');
    }
  }

  function compilePrompt(spec) {
    const mode = spec.mode || 'text';
    const promptMode = spec.prompt_mode || 'guided';
    let source = (spec.source_prompt || '').trim();
    const warnings = [];
    const seconds = Number(spec.target_seconds ?? spec.duration_seconds ?? 124 / 24);
    const targetFrames = Number(spec.target_frames ?? (5 + 17 * Math.round((seconds * 24 - 5) / 17)));
    if (!Number.isInteger(targetFrames) || targetFrames < 5 || (targetFrames - 5) % 17) throw new Error('Target frames must follow the H3 5 + 17k grid.');

    if (!source) {
      throw new Error('Write the scene prompt first.');
    }

    // Repair user formatting before binding validation; retain all supplied content.
    let originalSections = parseStructuredSections(source, true);
    let hasNativeSections = Boolean(originalSections);
    if (originalSections) {
      source = serializeSections(originalSections, Object.keys(originalSections));
      warnings.push('Prompt section formatting normalized automatically.');
    }
    const adaptTextToReferences = mode === 'refs' && originalSections &&
      originalSections.integrated_multimodal_description &&
      !originalSections.subject_definitions && !originalSections.retention_analysis && !originalSections.detailed_description;
    if (adaptTextToReferences) {
      originalSections.integrated_multimodal_description = Object.entries(originalSections).filter(([name]) => !['overall_soundscape', 'non_diegetic_music'].includes(name)).map(([name, body]) => body).join('\n\n');
      const adapted = completeSections(originalSections, NATIVE_TEXT_SECTIONS, {
        overall_soundscape: 'Use only the scene sounds requested in the description.',
        non_diegetic_music: 'Only music explicitly requested in the description.',
      });
      source = serializeSections(adapted, NATIVE_TEXT_SECTIONS);
      originalSections = null;
      hasNativeSections = false;
      warnings.push('Text/Frames description adapted to References using the attached reference roles.');
    } else if (originalSections && mode !== 'refs') {
      const description = Object.entries(originalSections).filter(([name]) => !['overall_soundscape', 'non_diegetic_music'].includes(name)).map(([, body]) => body).join('\n\n');
      originalSections.integrated_multimodal_description = description || source;
      originalSections = completeSections(originalSections, NATIVE_TEXT_SECTIONS, {
        integrated_multimodal_description: description || source,
        overall_soundscape: 'Use only the scene sounds requested in the description.',
        non_diegetic_music: 'Only music explicitly requested in the description.',
      });
      source = serializeSections(originalSections, NATIVE_TEXT_SECTIONS);
    }

    if (originalSections && mode === 'refs' && originalSections.integrated_multimodal_description) {
      originalSections.detailed_description = [originalSections.detailed_description, originalSections.integrated_multimodal_description].filter(Boolean).join('\n\n');
      delete originalSections.integrated_multimodal_description;
      source = serializeSections(originalSections, Object.keys(originalSections));
    }

    // --- FRAMES MODE ---
    if (mode === 'frames') {
      const frames = spec.frames || {};
      if (!frames.first && !frames.last) {
        throw new Error('Add a start frame, an end frame, or both.');
      }
      const frameTags = new Map();
      const bindings = [];
      if (frames.first) {
        frameTags.set('start', '<Picture 1>');
        bindings.push({ alias: 'start', tag: '<Picture 1>', kind: 'image', slot: 'first' });
      }
      if (frames.last) {
        const endTag = frames.first ? '<Picture 2>' : '<Picture 1>';
        frameTags.set('end', endTag);
        bindings.push({ alias: 'end', tag: endTag, kind: 'image', slot: 'last' });
      }

      // Mention replacement
      source = source.replace(/@([\p{L}\p{N}_-]+)/gu, (whole, name) => {
        if (!frameTags.has(name)) {
          throw new Error(`Frame mention ${whole} has no matching uploaded frame.`);
        }
        return frameTags.get(name);
      });

      validateNativeBindings(source, {picture: bindings.length});
      const structured = originalSections ? parseStructuredSections(source) : null;
      if (structured && structured.integrated_multimodal_description) {
        return { compiled_prompt: source, bindings, warnings };
      }

      const anchor = frames.first && frames.last ? 'Begin with <Picture 1> and end with <Picture 2>. ' :
        frames.first ? 'Begin with <Picture 1>. ' : 'End with <Picture 1>. ';

      const durationSec = Number(spec.target_seconds || 5.17).toFixed(2);
      const alignment = frames.first && frames.last ?
        `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the ${durationSec}-second mark of the target video.` :
        frames.first ?
          `For the target video, at 0.00 seconds into the target video, <Picture 1> (from Shot 1) is fully referenced.` :
          `How the reference pictures align with the target video — <Picture 1> (from Shot N) aligns with the ${durationSec}-second mark of the target video.`;

      const compiled = `${alignment}\n\nintegrated_multimodal_description: ${anchor}${/\[Shot\s+1\]/i.test(source) ? source : '[Shot 1] ' + source}\n\noverall_soundscape: Use the sounds described in the full sequence; otherwise only natural scene ambience.\n\nnon_diegetic_music: Only music explicitly requested in the full sequence.`;
      return { compiled_prompt: compiled, bindings, warnings };
    }

    // --- TEXT MODE ---
    if (mode === 'text') {
      if (/@[\p{L}\p{N}_-]+/u.test(source)) throw new Error('Text mode has no attached reference mentions.');
      validateNativeBindings(source, {});
      const structured = originalSections ? parseStructuredSections(source) : null;
      if (structured && structured.integrated_multimodal_description) {
        return { compiled_prompt: source, bindings: [], warnings };
      }
      const compiled = `integrated_multimodal_description: ${/\[Shot\s+1\]/i.test(source) ? source : '[Shot 1] ' + source}\n\noverall_soundscape: Use the sounds described in the full sequence; otherwise only natural scene ambience.\n\nnon_diegetic_music: Only music explicitly requested in the full sequence.`;
      return { compiled_prompt: compiled, bindings: [], warnings };
    }

    // --- REFERENCES MODE ---
    if (mode === 'refs') {
      const rawRefs = spec.references || [];
      if (!rawRefs.length) {
        throw new Error('Add at least one reference.');
      }
      validateLimits(rawRefs);

      // Check alias uniqueness
      const aliasSet = new Set();
      for (const r of rawRefs) {
        if (!r.alias || !/^[\p{L}\p{N}_-]{1,32}$/u.test(r.alias)) {
          throw new Error(`Invalid reference alias: '${r.alias}'. Use 1-32 letters, numbers, _ or -.`);
        }
        if (aliasSet.has(r.alias)) {
          throw new Error(`Duplicate reference alias: @${r.alias}`);
        }
        aliasSet.add(r.alias);
      }

      const ordered = orderedReferences(rawRefs);
      const bindings = [];
      const aliasToTag = new Map();
      const definitions = [];
      const retention = [];
      const mediaNotes = [];

      let imageIdx = 0;
      let subjectIdx = 0;
      let videoIdx = 0;
      let audioIdx = 0;

      for (const ref of ordered) {
        const role = (ref.role || 'custom').toLowerCase().trim();
        let tag;
        let bindingInfo = {
          asset_id: ref.asset_id,
          alias: ref.alias,
          kind: ref.kind,
          role: role,
          instruction: ref.instruction || '',
        };

        if (ref.kind === 'image') {
          const picNum = ++imageIdx;
          const picTag = `<Picture ${picNum}>`;
          bindingInfo.picture_idx = picNum;

          if (role === 'custom') {
            tag = picTag;
            bindingInfo.tag = tag;
            if (ref.instruction) {
              mediaNotes.push(`${picTag}: ${ref.instruction}`);
            }
          } else if (role === 'storyboard') {
            tag = picTag;
            bindingInfo.tag = tag;
            mediaNotes.push(`${picTag} is a multi-panel storyboard. ${ref.panel_order || "Use the panel/shot order described in the prompt"} as a shot and composition guide; do not render panel borders or labels. Follow explicit shot descriptions when they differ. ${ref.instruction || ""}`);
            retention.push(`${picTag}: attribute_transfer - guide shot order, framing and visual progression; do not treat the sheet as a single visible subject.`);
          } else {
            const subNum = ++subjectIdx;
            tag = `<Subject ${subNum}>`;
            bindingInfo.tag = tag;
            bindingInfo.subject_idx = subNum;
            definitions.push(`${tag} is the ${role} shown in ${picTag}. Keep its visible defining details.`);
            const retainMode = role === 'visual style' ? 'attribute_transfer' : 'fully_preserved';
            retention.push(`${tag}: ${retainMode} - preserve the defining visual attributes shown in ${picTag} wherever this subject appears in the target sequence.`);
          }
        } else if (ref.kind === 'video') {
          const vidNum = ++videoIdx;
          tag = `<Video ${vidNum}>`;
          const hasSpanMetadata = ref.fps != null && (ref.frame_count ?? ref.duration_frames) != null;
          if (spec.preview_only === true && !hasSpanMetadata) {
            if (ref.fps != null && Number(ref.fps) !== 24) throw new Error('Reference video requires verified canonical 24 fps metadata.');
            const knownFrames = ref.frame_count ?? ref.duration_frames;
            if (knownFrames != null && (!Number.isInteger(Number(knownFrames)) || Number(knownFrames) < 5)) throw new Error('Reference video requires a verified frame count of at least 5.');
            warnings.push('@' + ref.alias + ': effective span available after upload. Preview does not verify video or soundtrack timing.');
          } else {
            Object.assign(bindingInfo, referenceVideoSpan(ref, targetFrames));
            bindingInfo.used_seconds = bindingInfo.used_frames / 24;
            if (bindingInfo.used_frames !== bindingInfo.source_frames) warnings.push('@' + ref.alias + ' uses the first ' + bindingInfo.used_frames + ' frames (' + bindingInfo.used_seconds.toFixed(3) + ' seconds) on the H3 frame grid.' + (ref.use_audio ? ' Its paired soundtrack uses the same span.' : ''));
          }
          bindingInfo.video_idx = vidNum;
          bindingInfo.tag = tag;

          if (ref.use_audio) {
            const audNum = ++audioIdx;
            const audioTag = `<Audio ${audNum}>`;
            bindingInfo.paired_audio_tag = audioTag;
            bindingInfo.paired_audio_idx = audNum;
            if (bindingInfo.used_frames != null) {
              bindingInfo.paired_audio_frames = bindingInfo.used_frames;
              bindingInfo.paired_audio_seconds = bindingInfo.used_seconds;
            }
            mediaNotes.push(`${audioTag} is the soundtrack paired with reference video ${tag}.`);
          }

          if (role === 'whole scene') {
            mediaNotes.push(`${tag} is a whole-scene reference. Follow its action, camera movement, composition and timing. Follow its subjects and setting only where the detailed_description does not replace them. Explicit changes in the detailed_description take priority. Generate a new video rather than treating reference frames as locked pixels.`);
          } else if (role === 'motion and camera') {
            mediaNotes.push(`${tag} guides body performance, action timing and camera movement only. Do not transfer its actor identity, wardrobe, voice or location unless the detailed_description explicitly requests them.`);
          } else if (role === 'custom') {
            if (ref.instruction) {
              mediaNotes.push(`${tag}: ${ref.instruction}`);
            }
          } else {
            mediaNotes.push(`${tag} is a ${role} reference only. Do not transfer its actor identity, wardrobe, voice or location unless the detailed_description explicitly requests them.`);
          }
        } else if (ref.kind === 'audio') {
          const audNum = ++audioIdx;
          tag = `<Audio ${audNum}>`;
          bindingInfo.audio_idx = audNum;
          bindingInfo.tag = tag;
          if (role === 'custom' && ref.instruction) {
            mediaNotes.push(`${tag}: ${ref.instruction}`);
          } else {
            mediaNotes.push(`${tag} is a ${role} reference.`);
          }
        }

        const retentionRoles = ref.kind === 'video' ? {
          'whole scene': 'action, camera movement, composition and timing; explicit replacements take priority',
          'motion and camera': 'body performance, action timing and camera movement only',
          'motion': 'motion only', 'camera': 'camera movement only', 'camera movement': 'camera movement only', 'action': 'action only'
        } : ref.kind === 'audio' ? {
          'voice': 'voice qualities only', 'music': 'music only', 'sound effects': 'sound effects only'
        } : {};
        if (retentionRoles[role]) retention.push(tag + ': attribute_transfer - ' + retentionRoles[role] + '.');
        if (ref.kind !== 'image' && ref.instruction && role !== 'custom') mediaNotes.push(tag + ': ' + ref.instruction);
        aliasToTag.set(ref.alias, tag);
        bindings.push(bindingInfo);
      }

      // Native structured tags are valid reference mentions as well as aliases.
      const nativeSections = originalSections || (adaptTextToReferences ? parseStructuredSections(source) : null);
      const missing = bindings.filter(binding => {
        const pattern = new RegExp('@' + binding.alias + '(?=$|[^\\p{L}\\p{N}_-])', 'u');
        if (pattern.test(source)) return false;
        if (!nativeSections) return true;
        const tags = [binding.tag];
        if (binding.picture_idx) tags.push(`<Picture ${binding.picture_idx}>`);
        return !tags.some(tag => source.includes(tag));
      });
      if (missing.length) throw new Error('Mention every attached reference in the prompt: ' + missing.map(r => '@' + r.alias).join(', '));

      // Substitute mentions
      const unknown = [];
      let substituted = source.replace(/@([\p{L}\p{N}_-]+)/gu, (whole, name) => {
        if (!aliasToTag.has(name)) {
          unknown.push(whole);
          return whole;
        }
        return aliasToTag.get(name);
      });
      if (unknown.length) {
        throw new Error('Unknown mention: ' + [...new Set(unknown)].join(', '));
      }

      // Alias-led subject definitions need the attached image relation in native syntax.
      // Leave explicit native definitions unchanged so conflicting bindings still fail.
      if (originalSections?.subject_definitions) {
        const relationLines = originalSections.subject_definitions.split(/\n/).flatMap(line => {
          const match = line.match(/^\s*@([\p{L}\p{N}_-]+)(?=$|[^\p{L}\p{N}_-])/u);
          const binding = match && bindings.find(b => b.alias === match[1] && b.subject_idx);
          return binding && !/<Picture\s+\d+>/i.test(line)
            ? [`${binding.tag} is shown in <Picture ${binding.picture_idx}>.`] : [];
        });
        if (relationLines.length) {
          substituted = substituted.replace(/^(subject_definitions:\s*)/im,
            (_, header) => header + relationLines.join('\n') + '\n');
        }
      }

      validateNativeBindings(substituted, {picture:imageIdx, video:videoIdx, audio:audioIdx, subject:originalSections ? imageIdx : subjectIdx});
      // Check if prompt is already structured or user chose structured mode
      const structured = originalSections ? parseStructuredSections(substituted) : null;
      if (structured && (promptMode === 'structured' || hasNativeSections)) {
        warnings.push('Structured prompt controls retention and instructions directly; reference card roles, panel order and instructions are bypassed. Attached media tags are still validated.');
        // Validate native token indices in structured prompt
        const picTokens = [...substituted.matchAll(/<Picture\s+(\d+)>/gi)];
        for (const m of picTokens) {
          const idx = parseInt(m[1], 10);
          if (idx < 1 || idx > imageIdx) {
            throw new Error(`Referenced <Picture ${idx}> does not exist. Connected images: ${imageIdx}`);
          }
        }
        const vidTokens = [...substituted.matchAll(/<Video\s+(\d+)>/gi)];
        for (const m of vidTokens) {
          const idx = parseInt(m[1], 10);
          if (idx < 1 || idx > videoIdx) {
            throw new Error(`Referenced <Video ${idx}> does not exist. Connected videos: ${videoIdx}`);
          }
        }
        const audTokens = [...substituted.matchAll(/<Audio\s+(\d+)>/gi)];
        for (const m of audTokens) {
          const idx = parseInt(m[1], 10);
          if (idx < 1 || idx > audioIdx) {
            throw new Error(`Referenced <Audio ${idx}> does not exist. Connected audios: ${audioIdx}`);
          }
        }

        const completed = completeSections(structured, NATIVE_REF_SECTIONS, {
          subject_definitions: definitions.join('\n') || 'No separate still-image subject is defined.',
          summary: '[reference generation] Generate the sequence described below. ' + mediaNotes.join(' '),
          retention_analysis: retention.join('\n') || 'Apply only explicitly requested reference attributes.',
          detailed_description: structured.summary || 'Generate the sequence using the explicit reference instructions above.',
          overall_soundscape: 'Use only the scene sounds requested in the description.',
          non_diegetic_music: 'Only music explicitly requested in the description.',
        });
        const compiled = serializeSections(completed, NATIVE_REF_SECTIONS);
        validateSubjectBindings(compiled, completed, bindings);
        return { compiled_prompt: compiled, bindings, warnings };
      }

      // Guided mode: wrap deterministically into native schema
      const adapted = adaptTextToReferences ? parseStructuredSections(substituted) : null;
      const description = adapted ? adapted.integrated_multimodal_description : substituted;
      const shotOne = /\[Shot\s+1\]/i.test(description);
      const summaryLead = (description.match(/^[^\n.!?]+[.!?]?/) || [])[0]?.trim() || 'Generate the requested target sequence.';

      const compiled = [
        'subject_definitions:',
        definitions.join('\n') || 'No separate still-image subject is defined.',
        '',
        'summary:',
        `[reference generation] ${summaryLead} ${mediaNotes.join(' ')}`.trim(),
        '',
        'retention_analysis:',
        retention.join('\n') || 'Apply only the reference uses explicitly requested in the detailed_description; no additional retention is imposed.',
        '',
        'detailed_description:',
        shotOne ? description : `[Shot 1] ${description}`,
        '',
        'overall_soundscape:',
        adapted ? adapted.overall_soundscape : 'Use cited audio references and scene sounds described in the detailed_description, timed to their shots.',
        '',
        'non_diegetic_music:',
        adapted ? adapted.non_diegetic_music : 'Only music explicitly requested in the detailed_description.',
      ].join('\n');

      return { compiled_prompt: compiled, bindings, warnings };
    }

    throw new Error(`Unknown mode: ${mode}`);
  }

  return {
    compilePrompt,
    referenceVideoSpan,
    validateNativeBindings,
    parseStructuredSections,
    orderedReferences,
    validateLimits,
    validateSubjectBindings,
  };
});
