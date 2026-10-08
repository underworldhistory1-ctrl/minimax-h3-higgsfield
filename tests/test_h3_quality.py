import pathlib
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from h3_lab.quality import detect_luma_flicker, analyze_quality


class QualityTests(unittest.TestCase):
    def test_stable_and_gradual_ramp(self):
        for luma in ([100] * 170, [60 + i * .3 for i in range(170)]):
            self.assertEqual(detect_luma_flicker(luma)['status'], 'no_periodic_flicker_detected')

    def test_periodic_17_impulses(self):
        luma = [100 + (6 if i % 17 == 0 else 0) for i in range(170)]
        result = detect_luma_flicker(luma)
        self.assertEqual(result['status'], 'review')
        self.assertEqual(result['findings'][0]['period_frames'], 17)

    def test_scene_cuts_masked(self):
        luma = [60 if (i // 17) % 2 == 0 else 170 for i in range(170)]
        result = detect_luma_flicker(luma)
        self.assertEqual(result['status'], 'no_periodic_flicker_detected')
        self.assertGreater(result['metrics']['scene_cut_candidates'], 0)

    def test_limits(self):
        for values in ([0] * 363, [float('nan')], [-1]):
            with self.assertRaises(ValueError):
                detect_luma_flicker(values)

    def test_bounded_decoder(self):
        with tempfile.TemporaryDirectory() as directory:
            video = pathlib.Path(directory) / 'take.mp4'
            video.touch()
            with patch('h3_lab.quality.subprocess.run', return_value=SimpleNamespace(stdout=bytes([100]) * 640 * 85)) as run:
                result = analyze_quality(video)
            self.assertEqual(result['metrics']['analyzed_frames'], 85)
            self.assertEqual(run.call_args.kwargs['timeout'], 60)
            self.assertIn('362', run.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
