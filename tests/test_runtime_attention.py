import pathlib
import types
import unittest
from unittest.mock import Mock, patch
from h3_lab.runtime_attention import runtime_attention


class TestRuntimeAttention(unittest.TestCase):
    def test_explicit_launch_backends_are_reported_without_arguments(self):
        for flag, label, quantized in [("--use-pytorch-cross-attention", "PyTorch dense", False),
                ("--use-ck-attention", "Comfy Kitchen INT8", True), ("--use-sage-attention", "Sage attention", True)]:
            result = runtime_attention(["main.py", flag, "secret-token"], {})
            self.assertEqual(result["label"], label)
            self.assertEqual(result["quantized"], quantized)
            self.assertEqual(result['source'], 'launch_argument')
            self.assertNotIn("secret-token", str(result))

    def test_loaded_runtime_function_has_priority_over_requested_flags(self):
        def attention_pytorch():
            pass
        result = runtime_attention(["--use-ck-attention"], {"comfy.ldm.modules.attention":
            types.SimpleNamespace(optimized_attention=attention_pytorch)})
        self.assertEqual(result["label"], "PyTorch dense")
        self.assertFalse(result["quantized"])
        self.assertEqual(result['source'], 'loaded_runtime')
        self.assertTrue(result["checkpoint_overrides_possible"])

    def test_unknown_runtime_is_not_reported_as_verified_pytorch(self):
        self.assertEqual(runtime_attention([], {})["implementation"], "runtime_default")
        self.assertEqual(runtime_attention([], {})['source'], 'unknown')

    def test_supported_launch_paths_use_explicit_pytorch_baseline(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        for name in ["deploy/launcher.py", "deploy/activate_v2.py", "deploy/openbayes_h3_supervisor.py",
                "deploy/openbayes_h3.sh", "deploy/comfyui.service", "deploy/install_windows.py", "install.sh", "deploy/salad/entrypoint.sh"]:
            text = (root / name).read_text(encoding="utf-8")
            self.assertIn("--use-pytorch-cross-attention", text)
            if name not in ('deploy/launcher.py', 'deploy/openbayes_h3_supervisor.py'):
                self.assertNotIn("--use-ck-attention", text)
            self.assertNotIn("--use-sage-attention", text)

    def test_supervisor_attention_is_explicit_opt_in(self):
        from deploy.openbayes_h3_supervisor import worker_command
        args = types.SimpleNamespace(bind='127.0.0.1', port=8188, reserve_vram=3.0)
        self.assertIn('--use-pytorch-cross-attention', worker_command('python', args))
        args.attention_backend = 'ck-int8'
        command = worker_command('python', args)
        self.assertIn('--use-ck-attention', command)
        self.assertNotIn('--use-pytorch-cross-attention', command)

    def test_supervisor_rechecks_slow_startup_before_recovery(self):
        from deploy import openbayes_h3_supervisor as supervisor
        child = Mock()
        with patch.object(supervisor, 'wait_ready', return_value=True) as probe:
            self.assertTrue(supervisor.recovery_ready('http://local', child, False))
            probe.assert_called_once_with('http://local', child, timeout=1)
        with patch.object(supervisor, 'wait_ready') as probe:
            self.assertTrue(supervisor.recovery_ready('http://local', child, True))
            probe.assert_not_called()

    def test_linux_launch_paths_keep_ram_pressure_cache_enabled(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        for name in ['deploy/launcher.py', 'deploy/activate_v2.py', 'deploy/openbayes_h3_supervisor.py']:
            text = (root / name).read_text(encoding='utf-8')
            self.assertNotIn('--cache-none', text, name)
            self.assertIn('--cache-ram', text, name)

    def test_native_acceleration_requires_loaded_cuda13_backend(self):
        from h3_lab.runtime_attention import runtime_acceleration
        def modules(cuda='13.0', available=True, disabled=False):
            return {'torch': types.SimpleNamespace(__version__='2.9.1+cu130',
                        version=types.SimpleNamespace(cuda=cuda),
                        cuda=types.SimpleNamespace(is_available=lambda:True)),
                    'comfy.model_management': types.SimpleNamespace(get_torch_device=lambda:types.SimpleNamespace(type='cuda')),
                    'comfy_kitchen': types.SimpleNamespace(list_backends=lambda:
                        {'cuda': {'available': available, 'disabled': disabled}})}
        self.assertTrue(runtime_acceleration(modules())['native_cuda_ready'])
        for kwargs in [{'cuda':'12.8'}, {'available':False}, {'disabled':True}, {'cuda':None}]:
            self.assertFalse(runtime_acceleration(modules(**kwargs))['native_cuda_ready'])
        self.assertFalse(runtime_acceleration({})['native_cuda_ready'])
        self.assertNotIn('executable', runtime_acceleration(modules()))


    def test_cpu_worker_or_missing_cuda_is_not_native_gpu_ready(self):
        from h3_lab.runtime_attention import runtime_acceleration
        modules = {
            'torch': types.SimpleNamespace(__version__='2.9.1+cu130',
                version=types.SimpleNamespace(cuda='13.0'),
                cuda=types.SimpleNamespace(is_available=lambda:True)),
            'comfy_kitchen': types.SimpleNamespace(list_backends=lambda:
                {'cuda': {'available':True, 'disabled':False}}),
            'comfy.model_management': types.SimpleNamespace(get_torch_device=lambda:
                types.SimpleNamespace(type='cpu')),
        }
        self.assertFalse(runtime_acceleration(modules)['native_cuda_ready'])
        modules['comfy.model_management'].get_torch_device=lambda:types.SimpleNamespace(type='cuda')
        modules['torch'].cuda.is_available=lambda:False
        self.assertFalse(runtime_acceleration(modules)['native_cuda_ready'])
