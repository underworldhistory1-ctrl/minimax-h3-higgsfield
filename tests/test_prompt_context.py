import pathlib
import tempfile
import unittest
import json
from PIL import Image
from promptwriter import prepare_studio_context


TEXT = 'integrated_multimodal_description: [Shot 1] A person walks.\noverall_soundscape: Footsteps.\nnon_diegetic_music: None.'


class PromptContextTests(unittest.TestCase):
    def test_json_output_and_outer_fence_are_real_native_sections(self):
        value = {'non_diegetic_music': 'None.', 'overall_soundscape':'Footsteps.',
                 'integrated_multimodal_description':'[Shot 1] A person walks.\nSTYLE: natural.'}
        result = prepare_studio_context({'mode':'text','source_prompt':'Walk.'},
            chat=lambda messages:'```json\n'+json.dumps(value)+'\n```')
        self.assertIn('STYLE: natural.', result['compiled_prompt'])
        self.assertTrue(result['compiled_prompt'].startswith('integrated_multimodal_description:'))

    def test_provider_json_preserves_native_looking_literal_scene_text(self):
        description='The sign reads:\nnon_diegetic_music: Never stop.'
        output=json.dumps({'integrated_multimodal_description':description,
                           'overall_soundscape':'Wind.', 'non_diegetic_music':'None.'})
        result=prepare_studio_context({'source_prompt':'A sign.'},chat=lambda messages:output)
        self.assertIn(description,result['compiled_prompt'])
        self.assertTrue(result['compiled_prompt'].endswith('non_diegetic_music: None.'))

    def test_validation_retry_retains_original_media_and_exact_dialogue(self):
        calls=[]
        dialogue='<d>[Arabic] أهلا</d>'
        def writer(messages):
            calls.append(messages)
            return TEXT if len(calls)==1 else TEXT.replace('walks.', 'says '+dialogue+'.')
        media={'type':'image_url','image_url':{'url':'data:image/png;base64,fixture'}}
        result=prepare_studio_context({'source_prompt':'Say '+dialogue},media_parts=[media],chat=writer)
        self.assertEqual(len(calls),2)
        self.assertIn(dialogue,result['compiled_prompt'])
        self.assertEqual(calls[0][1],calls[1][1])
        self.assertIn(media,calls[1][1]['content'])

    def test_missing_field_is_corrected_once_without_inventing_content(self):
        calls=[]
        def writer(messages):
            calls.append(messages)
            return 'integrated_multimodal_description: Walk.' if len(calls)==1 else TEXT
        result=prepare_studio_context({'source_prompt':'Walk.'},chat=writer)
        self.assertEqual(result['compiled_prompt'],TEXT)
        self.assertEqual(len(calls),2)

    def test_retry_is_bounded_and_does_not_accept_invented_references(self):
        calls=[]
        def writer(messages):
            calls.append(messages)
            return TEXT.replace('A person','<Picture 9>')
        with self.assertRaisesRegex(ValueError,'after one correction attempt'):
            prepare_studio_context({'source_prompt':'Walk.'},chat=writer)
        self.assertEqual(len(calls),2)

    def test_timeline_is_checked_before_accepting_ai_rewrite(self):
        with self.assertRaisesRegex(ValueError,'timestamp'):
            prepare_studio_context({'source_prompt':'At 00:03.700 stop.'},chat=lambda messages:TEXT)

    def test_provider_json_duplicate_and_unknown_fields_rejected(self):
        from prompt_formats import native_response, response_schema
        from promptwriter import FIELDS
        with self.assertRaisesRegex(ValueError,'duplicate'):
            native_response('{"overall_soundscape":"Water","overall_soundscape":"Music"}',FIELDS)
        with self.assertRaisesRegex(ValueError,'unknown'):
            native_response('{"description":"Walk"}',FIELDS)
        schema=response_schema(FIELDS)
        self.assertFalse(schema['json_schema']['schema']['additionalProperties'])

    def test_provider_native_schema_extras_and_preamble_cannot_silently_disappear(self):
        from prompt_formats import native_response
        from promptwriter import FIELDS
        with self.assertRaisesRegex(ValueError, 'sections'):
            native_response(TEXT+'\nsummary: unexpected native field.',FIELDS)
        reordered='CAMERA: locked\nnon_diegetic_music: None.\noverall_soundscape: Wind.\nintegrated_multimodal_description: Walk.'
        with self.assertRaisesRegex(ValueError, 'outside native sections'):
            native_response(reordered,FIELDS)

    def test_text_has_native_output_and_no_reference_invention(self):
        result = prepare_studio_context({'mode': 'text', 'source_prompt': 'A person walks.'}, chat=lambda messages: TEXT)
        self.assertEqual(result['compiled_prompt'], TEXT)
        with self.assertRaisesRegex(ValueError, 'invented'):
            prepare_studio_context({'source_prompt': 'A person walks.'}, chat=lambda messages: TEXT.replace('A person', '<Picture 1>'))

    def test_dialogue_cannot_be_silently_rewritten(self):
        with self.assertRaisesRegex(ValueError, 'dialogue'):
            prepare_studio_context({'source_prompt': 'Say <d>[Arabic] أهلا</d>'}, chat=lambda messages: TEXT)

    def test_duplicate_sections_rejected(self):
        with self.assertRaisesRegex(ValueError, 'sections'):
            prepare_studio_context({'source_prompt': 'Walk.'}, chat=lambda messages: TEXT + '\nnon_diegetic_music: Music.')

    def test_subject_binding_and_audio_warning(self):
        binding = {'alias':'hero','tag':'<Subject 1>','kind':'image','picture_idx':1,'subject_idx':1,'role':'character identity'}
        video = {'alias':'v','tag':'<Video 1>','kind':'video','video_idx':1,'paired_audio_tag':'<Audio 1>'}
        prompt = 'subject_definitions: <Subject 1> shown in <Picture 1>.\nsummary: Replace the actor in <Video 1>.\nretention_analysis: <Subject 1>: fully_preserved.\ndetailed_description: [Shot 1] <Subject 1> follows <Video 1>.\noverall_soundscape: <Audio 1> ambience.\nnon_diegetic_music: None.'
        result = prepare_studio_context({'mode':'refs','source_prompt':'@hero replaces the actor in @v.','bindings':[binding,video]}, chat=lambda messages: prompt)
        self.assertTrue(result['warnings'])
        with self.assertRaisesRegex(ValueError, 'relationship'):
            prepare_studio_context({'mode':'refs','source_prompt':'@hero and @v','bindings':[binding,video]}, chat=lambda messages: prompt.replace('<Picture 1>', 'a picture'))

    def test_service_rejects_paths_and_generates_real_image_parts(self):
        from h3_lab.prompt_context import PromptContextService
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            Image.new('RGB',(100,50),'blue').save(root/'h3_studio_kf_test.png')
            seen=[]
            def writer(spec, parts):
                seen.extend(parts)
                return {'compiled_prompt':TEXT,'bindings':spec['bindings'],'warnings':[]}
            service=PromptContextService(root, writer=writer)
            spec={'mode':'refs','source_prompt':'Use @hero.','references':[{'alias':'hero','kind':'image','role':'custom','filename':'h3_studio_kf_test.png'}]}
            result=service.prepare(spec)
            self.assertEqual(result['bindings'][0]['tag'],'<Picture 1>')
            self.assertTrue(any(p.get('type')=='image_url' for p in seen))
            spec['references'][0]['filename']='../secret.png'
            with self.assertRaises(ValueError): service.prepare(spec)

    def test_ai_provider_failure_never_falls_back_to_no_images(self):
        from h3_lab.prompt_context import PromptContextService
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);Image.new('RGB',(20,20)).save(root/'h3_studio_kf_x.png')
            calls=[]
            def writer(spec,parts):
                calls.append(parts);raise ValueError('No vision support')
            service=PromptContextService(root,writer=writer)
            with self.assertRaisesRegex(ValueError,'vision'):
                service.prepare({'mode':'refs','source_prompt':'@x','references':[{'alias':'x','kind':'image','filename':'h3_studio_kf_x.png'}]})
            self.assertEqual(len(calls),1)


if __name__=='__main__': unittest.main()
