"""Exercise real Git migrations, including installer-owned patches and user edits."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from deploy import runtime_policy
from deploy.runtime_patches import patch_model, patch_navigation


MODEL = '''import torch
from torch import nn
class MLP(nn.Module):
    def forward(self, x):
        return comfy.ops.linear_input_act(self.fc2, self.fc1(x), "swiglu")
'''
SERVER = '''def middleware(request):
    sec_fetch_site = request.headers.get('Sec-Fetch-Site')
    if sec_fetch_site == 'cross-site':
        return False
'''


class RuntimePolicyTests(unittest.TestCase):
    def git(self, *args):
        return subprocess.check_output(['git', *map(str, args)], text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def test_default_is_ck_and_unknown_backend_never_silently_falls_back(self):
        self.assertEqual(runtime_policy.attention_flag('ck-int8'), '--use-ck-attention')
        self.assertEqual(runtime_policy.attention_flag('pytorch'), '--use-pytorch-cross-attention')
        with self.assertRaises(ValueError):
            runtime_policy.attention_flag('typo')

    def fixture(self, base):
        remote, author, client = (base / x for x in ('origin.git', 'author', 'client'))
        self.git('init', '--bare', remote)
        self.git('init', '-b', 'main', author)
        self.git('-C', author, 'config', 'user.email', 'tests@example.invalid')
        self.git('-C', author, 'config', 'user.name', 'H3 Tests')
        for name, value in [('comfy/ldm/minimax/model.py', MODEL), ('server.py', SERVER),
                            ('comfyui_version.py', '__version__ = "0.37.0"\n')]:
            path = author / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding='utf-8')
        self.git('-C', author, 'add', '.')
        self.git('-C', author, 'commit', '-m', 'old core')
        self.git('-C', author, 'remote', 'add', 'origin', remote)
        self.git('-C', author, 'push', 'origin', 'main')
        self.git('clone', '--branch', 'main', remote, client)
        before = self.git('-C', client, 'rev-parse', 'HEAD')
        (author / 'comfyui_version.py').write_text('__version__ = "0.43.0"\n')
        self.git('-C', author, 'commit', '-am', 'new core')
        self.git('-C', author, 'push', 'origin', 'main')
        target = self.git('-C', author, 'rev-parse', 'HEAD')
        return remote, client, before, target

    def test_old_core_upgrades_even_with_native_markers_and_managed_patches(self):
        with tempfile.TemporaryDirectory() as directory:
            remote, root, before, target = self.fixture(Path(directory))
            (root / 'comfy/ldm/minimax/model.py').write_text(patch_model(MODEL), encoding='utf-8')
            (root / 'server.py').write_text(patch_navigation(SERVER), encoding='utf-8')
            output = root / 'output/user-video.mp4'
            output.parent.mkdir()
            output.write_bytes(b'user video')
            with patch.object(runtime_policy, 'COMFY_REVISION', target), \
                 patch.object(runtime_policy, 'COMFY_ORIGINS', {str(remote)}):
                self.assertFalse(runtime_policy.core_current(root))
                self.assertTrue(runtime_policy.ensure_core(root))
                self.assertTrue(runtime_policy.core_current(root))
            self.assertEqual(self.git('-C', root, 'rev-parse', 'HEAD'), target)
            self.assertEqual(self.git('-C', root, 'rev-parse', 'refs/h3-launcher/previous-comfy'), before)
            self.assertEqual(output.read_bytes(), b'user video')
            receipt = json.loads((root / '.h3-launcher/core-upgrade.json').read_text())
            backup = Path(receipt['backup'])
            self.assertEqual((backup / 'server.py').read_text(), patch_navigation(SERVER))
            self.assertEqual((root / 'server.py').read_text(), SERVER)

    def test_user_modified_patch_is_preserved_without_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            remote, root, before, target = self.fixture(Path(directory))
            text = patch_model(MODEL) + '\n# user customization\n'
            (root / 'comfy/ldm/minimax/model.py').write_text(text)
            with patch.object(runtime_policy, 'COMFY_REVISION', target), \
                 patch.object(runtime_policy, 'COMFY_ORIGINS', {str(remote)}):
                with self.assertRaisesRegex(RuntimeError, 'local|custom'):
                    runtime_policy.ensure_core(root)
            self.assertEqual(self.git('-C', root, 'rev-parse', 'HEAD'), before)
            self.assertEqual((root / 'comfy/ldm/minimax/model.py').read_text(), text)

    def test_staged_changes_are_never_discarded(self):
        with tempfile.TemporaryDirectory() as directory:
            remote, root, before, target = self.fixture(Path(directory))
            (root / 'server.py').write_text(patch_navigation(SERVER))
            self.git('-C', root, 'add', 'server.py')
            with patch.object(runtime_policy, 'COMFY_REVISION', target), \
                 patch.object(runtime_policy, 'COMFY_ORIGINS', {str(remote)}):
                with self.assertRaisesRegex(RuntimeError, 'staged|local'):
                    runtime_policy.ensure_core(root)
            self.assertEqual(self.git('-C', root, 'rev-parse', 'HEAD'), before)

    def test_unknown_origin_is_never_updated(self):
        with tempfile.TemporaryDirectory() as directory:
            _, root, before, target = self.fixture(Path(directory))
            with patch.object(runtime_policy, 'COMFY_REVISION', target):
                with self.assertRaisesRegex(RuntimeError, 'origin'):
                    runtime_policy.ensure_core(root)
            self.assertEqual(self.git('-C', root, 'rev-parse', 'HEAD'), before)

    def test_portable_requires_the_target_version(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'comfyui_version.py').write_text('__version__ = "0.37.0"\n')
            self.assertFalse(runtime_policy.core_current(root))
            with self.assertRaisesRegex(RuntimeError, 'Portable|Git'):
                runtime_policy.ensure_core(root)
