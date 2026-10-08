"""Validate provider syntax without guessing missing semantic content."""
import json
import re

NATIVE_FIELDS = ('subject_definitions', 'summary', 'retention_analysis', 'detailed_description',
                 'integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music')


def native_response(text, fields):
    if not isinstance(text, str) or not text.strip() or len(text) > 32000:
        raise ValueError('Provider returned an empty or oversized prompt.')
    text = text.strip()
    fence = re.fullmatch(r'```(?:json|text|markdown)?\s*\n([\s\S]*?)\n```', text, re.I)
    if fence:
        text = fence[1].strip()
    if text.startswith('{'):
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError('Provider returned duplicate sections.')
                result[key] = value
            return result
        try:
            sections = json.loads(text, object_pairs_hook=unique)
        except (json.JSONDecodeError, RecursionError) as error:
            raise ValueError('Provider JSON is incomplete or malformed.') from error
        if not isinstance(sections, dict) or set(sections) != set(fields):
            raise ValueError('Provider JSON has missing or unknown native sections.')
        if any(not isinstance(body, str) or not body.strip() for body in sections.values()):
            raise ValueError('Provider sections must be nonempty strings.')
        sections = {name:sections[name].strip() for name in fields}
        text = '\n'.join(name + ': ' + sections[name] for name in fields)
        # The JSON parser has already established boundaries. Native-looking
        # words inside dialogue/sign text must not become new fields.
        return text, sections
    else:
        # Normalize only exact native field names, never STYLE/CAMERA or prose.
        pattern = '|'.join(name.replace('_', r'[ _-]+') for name in NATIVE_FIELDS)
        text = re.sub(
            r'^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(' + pattern + r')(?:\*\*)?[ \t]*(?:[:：][ \t]*(?:\*\*)?[ \t]*|$)',
            lambda match: re.sub(r'[ -]+', '_', match[1].lower()) + ': ', text, flags=re.M | re.I)
    headings = list(re.finditer(r'^(' + '|'.join(NATIVE_FIELDS) + r'):[ \t]*', text, re.M))
    if len(headings) != len(fields) or {m[1] for m in headings} != set(fields):
        raise ValueError('Provider output has missing or duplicate native sections.')
    if text[:headings[0].start()].strip():
        raise ValueError('Provider returned content outside native sections; keep it in the description.')
    sections = {m[1]: text[m.end():headings[i + 1].start() if i + 1 < len(headings) else len(text)].strip()
                for i, m in enumerate(headings)}
    if any(not value for value in sections.values()):
        raise ValueError('Provider returned an empty native section.')
    if [m[1] for m in headings] != list(fields):
        text = '\n'.join(name + ': ' + sections[name] for name in fields)
    return text, sections


def response_schema(fields):
    return {'type': 'json_schema', 'json_schema': {
        'name': 'h3_native_prompt', 'strict': True,
        'schema': {'type': 'object', 'properties': {name: {'type': 'string'} for name in fields},
                   'required': list(fields), 'additionalProperties': False}}}
