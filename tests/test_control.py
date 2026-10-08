import copy
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from h3_lab.control import CONTROL_FILE, prepare_control, validate_control_graph
from h3_lab.capabilities import check_capabilities


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        (self.root / 'control.mp4').touch()
        self.metadata = {'width': 864, 'height': 480, 'fps': 24.0, 'frame_count': 124}
        self.spec = {'mode': 'text', 'width': 864, 'height': 480, 'length': 124,
                     'control': {'control_file': 'control.mp4', 'strength': .8},
                     'workflow': {
                         '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'}},
                         '2': {'class_type': 'ModelPatchLoader', 'inputs': {'name': CONTROL_FILE}},
                         '3': {'class_type': 'LoadVideo', 'inputs': {'file': 'control.mp4'}},
                         '4': {'class_type': 'GetVideoComponents', 'inputs': {'video': ['3', 0]}},
                         '5': {'class_type': 'MiniMaxH3FunControlNetApply', 'inputs': {'model': ['1', 0], 'vae': ['7', 0], 'model_patch': ['2', 0], 'control_video': ['4', 0], 'strength': .8, 'start_percent': 0, 'end_percent': 1}},
                         '6': {'class_type': 'MiniMaxH3ImageToVideo', 'inputs': {'width': 864, 'height': 480, 'length': 124}},
                         '7': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'minimax_h3_video_vae_fp16.safetensors'}},
                         '8': {'class_type': 'KSampler', 'inputs': {'model': ['5', 0]}}}}

    def validate(self, spec=None):
        with patch('h3_lab.control.video_metadata', return_value=self.metadata):
            return validate_control_graph(spec or self.spec, self.root, {'controlnet_ready': True})

    def test_matching_graph(self):
        self.assertEqual(self.validate()['strength'], .8)

    def test_mismatched_graph_file_and_disconnected_patch(self):
        for key in ('file', 'model'):
            spec = copy.deepcopy(self.spec)
            if key == 'file':
                spec['workflow']['3']['inputs']['file'] = 'other.mp4'
            else:
                spec['workflow']['8']['inputs']['model'] = ['1', 0]
            with self.assertRaises(ValueError):
                self.validate(spec)

    def test_unsupported_combinations_and_metadata(self):
        for key, value in [('mode', 'refs'), ('continuation', {'type': 'generated'}), ('refine', True)]:
            spec = copy.deepcopy(self.spec)
            spec[key] = value
            with self.assertRaises(ValueError):
                self.validate(spec)
        self.metadata['frame_count'] = 123
        with self.assertRaises(ValueError):
            self.validate()

    def test_missing_capability_and_traversal(self):
        with self.assertRaises(ValueError):
            validate_control_graph(self.spec, self.root, {})
        self.spec['control']['control_file'] = '../control.mp4'
        with self.assertRaises(ValueError):
            self.validate()

    def test_short_source_rejected_before_ffmpeg(self):
        self.metadata['frame_count'] = 12
        with patch('h3_lab.control.video_metadata', return_value=self.metadata), patch('h3_lab.control.subprocess.run') as run:
            with self.assertRaises(ValueError):
                prepare_control('control.mp4', self.root, 864, 480, 124)
            run.assert_not_called()

    def test_optional_missing_does_not_pollute_baseline_reasons(self):
        result = check_capabilities()
        self.assertFalse(result['controlnet_ready'])
        self.assertFalse(result['refine_ready'])
        self.assertTrue(result['controlnet_missing_reasons'])
        self.assertFalse(any('ControlNet' in reason for reason in result['missing_reasons']))


if __name__ == '__main__':
    unittest.main()
