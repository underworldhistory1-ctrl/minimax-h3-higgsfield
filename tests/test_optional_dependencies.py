import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from deploy import install_python_dependencies as installer


class OptionalDependencyTests(unittest.TestCase):
    def test_install_pins_exact_working_stack_and_preserves_user_constraints(self):
        versions = {'torch':'2.11.0+cu130', 'torchvision':'0.26.0+cu130', 'torchaudio':'2.11.0+cu130'}
        seen = []
        with tempfile.TemporaryDirectory() as directory:
            requirement = Path(directory) / 'requirements.txt'
            requirement.write_text('torch\neinops\n')
            def run(command, **kwargs):
                constraint = Path(command[command.index('-c')+1])
                seen.append(constraint)
                self.assertEqual(constraint.read_text(), ''.join(f'{name}=={v}\n' for name,v in versions.items()))
                self.assertEqual(os.environ['PIP_CONSTRAINT'], 'user-constraints.txt')
                self.assertNotIn('--upgrade', command)
            with patch.object(installer, 'validate_cuda') as cuda, \
                 patch.object(installer, 'stack_versions', return_value=versions), \
                 patch.object(installer.subprocess, 'run', side_effect=run), \
                 patch.dict(os.environ, PIP_CONSTRAINT='user-constraints.txt'):
                installer.install(requirement)
                self.assertEqual(cuda.call_count, 2)
            self.assertTrue(seen)
            self.assertTrue(all(not path.exists() for path in seen))

    def test_conflict_stops_without_starting_or_rechecking_failed_install(self):
        with tempfile.TemporaryDirectory() as directory:
            requirement = Path(directory) / 'requirements.txt'
            requirement.touch()
            with patch.object(installer, 'validate_cuda') as cuda, \
                 patch.object(installer, 'stack_versions', return_value={'torch':'2.9.1+cu130'}), \
                 patch.object(installer.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['pip'])):
                with self.assertRaises(subprocess.CalledProcessError):
                    installer.install(requirement)
                self.assertEqual(cuda.call_count, 1)

    def test_broken_gpu_stops_before_package_install(self):
        with tempfile.TemporaryDirectory() as directory:
            requirement = Path(directory) / 'requirements.txt'
            requirement.touch()
            with patch.object(installer, 'validate_cuda', side_effect=RuntimeError('no kernel image')), \
                 patch.object(installer.subprocess, 'run') as pip:
                with self.assertRaisesRegex(RuntimeError, 'kernel'):
                    installer.install(requirement)
                pip.assert_not_called()

    def test_probe_executes_a_kernel_not_only_cuda_availability(self):
        with patch.object(installer.subprocess, 'run') as run:
            installer.validate_cuda()
        self.assertIn('device=', run.call_args.args[0][-1])
        self.assertIn('x@x', run.call_args.args[0][-1])
        self.assertIn('synchronize', run.call_args.args[0][-1])

    def test_missing_companion_can_be_added_without_replacing_working_torch(self):
        with tempfile.TemporaryDirectory() as directory:
            requirement = Path(directory) / 'requirements.txt'
            requirement.write_text('torchvision\n')
            before = {'torch':'2.9.1+cu130'}
            after = {**before, 'torchvision':'0.24.1+cu130'}
            with patch.object(installer, 'validate_cuda'), \
                 patch.object(installer, 'stack_versions', side_effect=[before, after]), \
                 patch.object(installer.subprocess, 'run'):
                installer.install(requirement)

    def test_previously_installed_component_version_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            requirement = Path(directory) / 'requirements.txt'
            requirement.touch()
            with patch.object(installer, 'validate_cuda') as cuda, \
                 patch.object(installer, 'stack_versions', side_effect=[{'torch':'2.9.1+cu130'}, {'torch':'2.9.1+cpu'}]), \
                 patch.object(installer.subprocess, 'run'):
                with self.assertRaisesRegex(RuntimeError, 'changed the CUDA stack'):
                    installer.install(requirement)
                self.assertEqual(cuda.call_count, 1)


if __name__ == '__main__':
    unittest.main()
