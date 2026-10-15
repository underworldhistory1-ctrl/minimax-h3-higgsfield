import contextlib
import io
import json
import unittest
from unittest.mock import patch

from deploy import verify_h3_server as verifier
from deploy.download_optional_loras import LORAS


class ServerLoraReadinessTests(unittest.TestCase):
    def test_discovery_handles_registered_subfolders_and_reports_exact_missing_names(self):
        names = ['community/' + row[0] for row in LORAS]
        self.assertEqual(verifier.missing_loras(names), [])
        self.assertEqual(verifier.missing_loras(names[1:]), [LORAS[0][0]])

    def test_malformed_lora_discovery_cannot_claim_readiness(self):
        for value in (None, {}, 'one-file.safetensors', [None]):
            with self.assertRaises(ValueError):
                verifier.missing_loras(value)

    def test_full_server_verifier_fails_when_one_required_lora_is_not_exposed(self):
        from urllib.parse import urlsplit
        nodes = dict.fromkeys(verifier.REQUIRED_NODES, True)
        caps = {'ready': True, 'guides_ready': True, 'continuation_ready': True, 'add_guide': True,
                'continuation_nodes': dict.fromkeys(('MiniMaxH3GeneratedAVMaskedContext',
                    'MiniMaxH3ExistingVideoMaskedContext', 'H3LabLoadContext', 'H3LabTrimAV'), True)}
        routes = {'/h3_studio/readiness': {'models': dict.fromkeys(verifier.REQUIRED_MODELS, True),
                    'nodes': nodes, 'quality': {'h3_vae_tile_fix': True}},
                  '/h3_studio/lab/capabilities': caps, '/system_stats': {'devices': []},
                  '/h3_studio/loras': {'items': [row[0] for row in LORAS[1:]]},
                  '/h3_studio/library': {'items': []}, '/h3_studio/image_library': {'items': []},
                  '/h3_studio/image_readiness': {'nodes': dict.fromkeys(verifier.REQUIRED_IMAGE_NODES, True)},
                  '/queue': {'queue_running': [], 'queue_pending': []}}
        markers = 'H3 Higgsfield H3GraphBuilder renderGuides H3PromptCompiler H3Configuration H3ConfigurationUI H3ProjectController'
        class Opener:
            def open(self, url, **kwargs):
                path = urlsplit(url).path
                return io.BytesIO(markers.encode() if path.startswith('/extensions/') else json.dumps(routes[path]).encode())
        output = io.StringIO()
        with patch('sys.argv', ['verify_h3_server.py', '--url', 'http://server.invalid']), \
             patch.dict('os.environ', {'H3_ACCESS_TOKEN': '', 'QWEN_IMAGE_PROFILES': ''}), \
             patch.object(verifier.urllib.request, 'build_opener', return_value=Opener()), \
             contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as error:
                verifier.main()
        self.assertEqual(error.exception.code, 1)
        report = json.loads(output.getvalue())
        self.assertEqual(report['missing_loras'], [LORAS[0][0]])
        self.assertFalse(report['loras_ready'])
