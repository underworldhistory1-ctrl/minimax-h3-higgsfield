import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request
import promptwriter
from deploy.node_integrity import assert_node_integrity
from deploy.runtime_patches import patch_cache


class InstallerTrustTests(unittest.TestCase):
    def test_node_edits_rejected_and_owned_patch_exact(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'ComfyUI-MiniMax-H3-MotionCache'
            root.mkdir()
            def git(*args):
                subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)
            git('init', '-q')
            source = "video + self.video_residual, audio + self.audio_residual\n(output_video - video).clone()\n(output_audio - audio).clone()\n"
            target = root / 'motion_cache.py'
            target.write_text(source)
            git('add', '.')
            git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
            assert_node_integrity(root)
            target.write_text(patch_cache(source))
            assert_node_integrity(root)
            with self.assertRaises(RuntimeError):
                assert_node_integrity(root, allow_runtime_patch=False)
            target.write_text(patch_cache(source) + '# unrelated edit\n')
            with self.assertRaises(RuntimeError):
                assert_node_integrity(root)
            target.write_text(source)
            (root / '.git/info/exclude').write_text('injected.py\n')
            (root / 'injected.py').write_text('pass')
            with self.assertRaises(RuntimeError):
                assert_node_integrity(root)

    def test_provider_redirect_strips_auth_and_blocks_downgrade(self):
        handler = promptwriter._ProviderRedirect()
        request = Request('https://provider.example/v1', headers={'Authorization': 'Bearer dummy'})
        redirected = handler.redirect_request(request, None, 302, '', {}, 'https://other.example/endpoint')
        self.assertIsNone(redirected.get_header('Authorization'))
        same = handler.redirect_request(request, None, 302, '', {}, 'https://provider.example/new')
        self.assertEqual(same.get_header('Authorization'), 'Bearer dummy')
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, '', {}, 'http://other.example/')

    def test_remote_plain_http_key_rejected_before_network(self):
        with patch.dict(os.environ, {'H3_LLM_BASE': 'http://remote.example', 'H3_LLM_MODEL': 'test', 'H3_LLM_API_KEY': 'dummy'}), patch.object(promptwriter, '_provider_open') as network:
            with self.assertRaisesRegex(ValueError, 'requires HTTPS'):
                promptwriter.studio_chat([])
            network.assert_not_called()
