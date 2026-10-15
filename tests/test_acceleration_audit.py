import sys
import types
import unittest
from unittest.mock import patch
from deploy import environment_audit, launcher


class AccelerationAuditTests(unittest.TestCase):
    def audit(self, cuda_version, native=True):
        fake_torch = types.SimpleNamespace(version=types.SimpleNamespace(cuda=cuda_version),
            cuda=types.SimpleNamespace(is_available=lambda: True,
                get_device_name=lambda n: 'NVIDIA GeForce RTX 5090',
                get_device_capability=lambda n: (12, 0),
                get_device_properties=lambda n: types.SimpleNamespace(total_memory=32*1024**3)))
        fake_kitchen = types.SimpleNamespace(list_backends=lambda: {
            'cuda': {'available': native, 'disabled': False},
            'eager': {'available': True, 'disabled': False}})
        with patch.object(environment_audit.platform, 'platform', return_value='test'), patch.dict(sys.modules, {'torch': fake_torch, 'comfy_kitchen': fake_kitchen}), \
                patch.object(environment_audit.importlib.metadata, 'version', return_value='test'), \
                patch.object(environment_audit.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)):
            return environment_audit.audit()

    def test_cuda_12_is_rejected_even_when_gpu_is_available(self):
        result = self.audit('12.8')
        self.assertFalse(result['ready'])
        self.assertIn('13.0', '; '.join(result['issues']))

    def test_missing_native_cuda_backend_is_not_reported_ready(self):
        result = self.audit('13.0', native=False)
        self.assertFalse(result['ready'])

    def test_cuda_13_with_native_backend_is_ready(self):
        result = self.audit('13.0')
        self.assertTrue(result['ready'], result['issues'])
        self.assertTrue(result.get('acceleration', {}).get('native_cuda_ready'))

    def test_launcher_does_not_reuse_degraded_environment(self):
        args = types.SimpleNamespace(no_refine=True, no_controlnet=True)
        with patch.object(launcher, 'audit_environment', return_value={'ready': False}), \
                patch.object(launcher.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0)):
            self.assertFalse(launcher.environment_ready('python', args))


if __name__ == '__main__':
    unittest.main()
