import ast
import tempfile
import unittest
from pathlib import Path
from deploy.runtime_patches import patch_model, patch_cache, patch_navigation, apply_patches


class RuntimePatchTests(unittest.TestCase):
    def test_mlp_idempotent_and_unknown_rejected(self):
        source = "class MLP(nn.Module):\n    def forward(self, x):\n        return comfy.ops.linear_input_act(self.fc2, self.fc1(x), 'swiglu')\n"
        updated = patch_model(source)
        ast.parse(updated)
        self.assertEqual(updated, patch_model(updated))
        self.assertIn('torch.is_grad_enabled()', updated)
        self.assertIn('def h3_mlp_chunked', patch_model(source.replace("'swiglu'", '"swiglu"')))
        with self.assertRaises(RuntimeError):
            patch_model(source.replace('swiglu', 'relu'))

    def test_motion_cache_cpu_and_idempotent(self):
        source = "def apply_residual(self, video, audio):\n    return [video + self.video_residual, audio + self.audio_residual]\n\ndef update(self, video, audio, output_video, output_audio):\n    self.video_residual = (output_video - video).clone()\n    self.audio_residual = (output_audio - audio).clone()\n"
        updated = patch_cache(source)
        self.assertEqual(updated, patch_cache(updated))
        self.assertEqual(updated.count("device='cpu'"), 2)
        self.assertIn('self.video_residual.to(video)', updated)

    def test_navigation_only_documents(self):
        source = "def check(request):\n    if True:\n        if True:\n            sec_fetch_site = request.headers['Sec-Fetch-Site']\n            if sec_fetch_site == 'cross-site':\n                return False\n    return True\n"
        updated = patch_navigation(source)
        self.assertEqual(updated, patch_navigation(updated))
        legacy = updated.replace('# H3_PUBLIC_DOCUMENT_NAVIGATION', '# legacy').replace("'/extensions/h3_studio/index.html', '/extensions/h3_studio/image.html',", '')
        migrated = patch_navigation(legacy)
        self.assertEqual(migrated, patch_navigation(migrated))
        namespace = {}
        exec(updated, namespace)
        class Request:
            method = 'GET'
            path = '/extensions/h3_studio/image.html'
            headers = {'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        request = Request()
        self.assertTrue(namespace['check'](request))
        request.path = '/h3_studio/lab/jobs'
        self.assertFalse(namespace['check'](request))
        request.path = '/extensions/h3_studio/image.html'
        request.method = 'POST'
        self.assertFalse(namespace['check'](request))
        request.method = 'GET'
        request.headers['Sec-Fetch-Mode'] = 'cors'
        self.assertFalse(namespace['check'](request))

    def test_invalid_source_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = root/'comfy/ldm/minimax/model.py'
            model.parent.mkdir(parents=True)
            model.write_text("class MLP(nn.Module):\n    def forward(self,x):\n        return comfy.ops.linear_input_act(self.fc2, self.fc1(x), 'swiglu')\n")
            original = model.read_bytes()
            (root/'server.py').write_text('unsupported = True\n')
            with self.assertRaises(RuntimeError):
                apply_patches(root)
            self.assertEqual(original, model.read_bytes())


if __name__ == '__main__':
    unittest.main()
