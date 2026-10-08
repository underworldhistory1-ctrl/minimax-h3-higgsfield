# Prompt input and preparation

The scene textarea accepts plain prose and native H3 sections, Markdown/native headings (including a missing colon), Arabic headings, outer code fences, JSON with comments/trailing commas, and fenced or block-scalar YAML. The original textarea and saved draft remain unchanged. Preview shows the actual compiled native prompt.

## Ready parsers included offline

- Microsoft jsonc-parser 3.3.1 (MIT): https://github.com/microsoft/node-jsonc-parser
- eemeli/yaml 2.9.1 (ISC): https://eemeli.org/yaml/

Browser code and licenses are vendored under web/h3/vendor. The lockfile pins npm integrity values, and manifest.json records the built artifact hash. Rebuild with npm ci --prefix tools/prompt-parsers and npm run build --prefix tools/prompt-parsers. Node/npm are needed to rebuild only; a deployed ComfyUI server serves the bundled JavaScript directly.

Only recognized keys/headings become native sections. Unknown object fields remain readable scene instructions. Nested envelopes named prompt, sections, h3_prompt, or video_prompt retain their content. Duplicate or ambiguous mappings, unsafe integer precision, complex/aliased YAML, custom YAML tags and incomplete structures remain verbatim with an explanatory preview notice; the adapter never guesses missing words or silently discards duplicate instructions. Parsed scalar strings are not reinterpreted as headings. Source comments are retained. Uploaded assets determine native bindings; a references key in JSON cannot create an upload or graph input.

YAML is recognized by an outer yaml/yml fence or an explicit multiline block scalar. Arbitrary prose is not sent through a speculative YAML conversion. Malformed structured text may be sent as preserved scene prose; this does not prove that H3 interprets every malformed document correctly.

## Preparation choices

Automatic formats locally and uses AI only if the server reports a configured provider. It waits for an outstanding provider status check. Explicit AI mode still reports missing configuration or provider failure; it never silently switches to a text-only understanding step. Use my prompt directly always applies deterministic formatting. Existing saved mode choices remain respected.

Preview works locally without uploads/model calls when deterministic preparation is selected. AI preview retains actual connected media. The preparation payload uses normalized scene text, while the textarea/draft retain the original input.

## Provider validation

promptwriter accepts a complete native response or strict JSON whose keys are the native fields. It removes a complete outer code fence, normalizes exact native headers, and validates all required nonempty sections. Ordinary STYLE/CAMERA prose remains content. Incorrect schema fields, duplicate JSON keys, missing sections, content outside native sections, unconnected references, broken subject/picture relations, altered explicit <d> dialogue, lost explicit timestamps, and known truncated chat completions are rejected.

One validation correction attempt retains the original multimodal request and asks the provider to fix the specific failure. A second invalid result blocks submission. Provider/network errors never discard media or silently fall back. Set H3_LLM_JSON_SCHEMA=1 only for a provider supporting chat-completions JSON Schema; this adds a strict native-field response_format. It is opt-in because OpenAI-compatible endpoints vary. Credentials remain server-side.

These checks constrain syntax and specific preservation rules; they cannot prove semantic fidelity, infer unseen footage, eliminate all hallucinations, or replace MiniMax hosted H3-Context-IR. On a server without an AI provider, Automatic is formatting only and the UI says so. GPU quality and real provider inference must be tested separately.
