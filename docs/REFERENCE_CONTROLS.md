# Reference controls

Reference mode supports the model's native image, video and audio slots. Roles and instructions compile into its structured prompt; they do not invent unsupported per-reference attention-strength inputs.

- Assign the same Character group to several pictures of one subject. Ungrouped Character images remain separate subjects. Explicit native subject definitions remain authoritative.
- Add an independent instruction to every reference role. Storyboard panel order is a separate field; a board is not automatically split into timed frames.
- Preview the selected video/audio range before submitting. Playback stops at the selected end; video soundtrack selection remains independent of standalone audio references.
- Use Original resolution per image to bypass the wrapper's optional 2048-pixel resize. This preserves uploaded pixels, not the model's internal resolution: native reference encoding still follows its selected size policy, canvas and VRAM limits.
- Scene save, local draft restoration and Reuse retain reference settings. Missing assets or incompatible settings must be resolved before generation.

Video references and standalone audio each have their own 15-second total budget; neither needs to fill it. Video soundtracks remain paired. This UI coordinates supported workflows without requiring an API key. It does not automatically judge identity, acting, composition or the best artistic strength.

Explicit Structured/native-complete prompts own their directives. The UI warns that card roles, panel order and instructions are bypassed in that path; choose Guided mode to compile card instructions automatically.
