"""Ordinary control video supplies vision evidence without native reference tags."""
import pathlib
import shutil
import subprocess
import tempfile
import unittest
from h3_lab.prompt_context import PromptContextService


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class ControlPromptContextTests(unittest.TestCase):
    def test_control_samples_are_untagged_and_content_cache_survives_filename_change(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            source=root/'h3_studio_kf_context.mp4'
            subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=red:s=256x256:r=24',
                            '-frames:v','141','-c:v','libx264','-threads','2',str(source)],check=True)
            calls=[]
            def writer(spec,parts):
                calls.append((spec,parts))
                return {'compiled_prompt':'prepared'}
            service=PromptContextService(root,writer=writer)
            spec={'mode':'text','source_prompt':'Follow the motion with a new character.',
                  'target_frames':141,'control':{'enabled':True,'kind':'pose','control_file':'map_first.mp4','source_file':'source_first.mp4','request_id':'first','provenance':{'cache_hit':False}},
                  'control_context_filename':source.name}
            result=service.prepare(spec)
            self.assertEqual(calls[0][0]['bindings'],[])
            self.assertEqual(sum(p['type']=='image_url' for p in calls[0][1]),6)
            evidence=' '.join(p['text'] for p in calls[0][1] if p['type']=='text')
            self.assertIn('NOT an attached native Picture/Video reference',evidence)
            self.assertNotIn('<Video 1>',evidence)
            copy=root/'h3_studio_kf_context_copy.mp4';shutil.copy2(source,copy)
            repeated=service.prepare({**spec,'control_context_filename':copy.name,
                                      'control':{**spec['control'],'control_file':'map_second.mp4','source_file':'source_second.mp4','request_id':'second','provenance':{'cache_hit':True}}})
            self.assertEqual(repeated['fingerprint'],result['fingerprint'])
            self.assertEqual(len(calls),1)
            changed=service.prepare({**spec,'control':{**spec['control'],'kind':'depth'}})
            self.assertNotEqual(changed['fingerprint'],result['fingerprint'])
            self.assertEqual(len(calls),2)
            with self.assertRaises(ValueError):
                service.prepare({**spec,'control':{'enabled':False}})
            with self.assertRaises(ValueError):
                service.prepare({**spec,'control_context_filename':'../outside.mp4'})
