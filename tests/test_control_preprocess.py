import pathlib
import shutil
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
from h3_lab.control_preprocess import preprocessor_status, process_control, _evict_cache


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg tools required')
class PreprocessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / 'source.mp4'
        subprocess.run([shutil.which('ffmpeg'), '-nostdin', '-v', 'error', '-f', 'lavfi',
            '-i', 'testsrc2=s=256x256:r=24:d=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-threads', '2', str(self.source)], check=True, timeout=30)

    def test_real_canny_and_gray_exact_canvas_frames(self):
        import cv2
        for kind in ('canny', 'gray'):
            progress = []
            result = process_control(self.source, self.root, 256, 256, 34, kind,
                                     progress=lambda *args: progress.append(args))
            self.assertEqual((result['fps'], result['frame_count'], result['width'], result['height']), (24, 34, 256, 256))
            self.assertEqual(result['input_type'], 'video')
            self.assertTrue((self.root / result['source_file']).is_file())
            capture = cv2.VideoCapture(str(self.root / result['filename']))
            try:
                ok, mapped = capture.read()
                self.assertTrue(ok)
                self.assertGreater(mapped.std(), 5)
                if kind == 'canny':
                    self.assertGreater((mapped[:, :, 0] < 20).mean(), .5)
                else:
                    self.assertLess(abs(mapped[:, :, 0].astype(float) - mapped[:, :, 1]).mean(), 2)
            finally:
                capture.release()
            self.assertEqual(progress[-1], (34, 34, 'verify'))

    def test_cancel_cleans_normalized_and_maps(self):
        cancel = threading.Event()
        def progress(done, total, phase):
            if phase == 'process' and done >= 2:
                cancel.set()
        with self.assertRaisesRegex(ValueError, 'cancelled'):
            process_control(self.source, self.root, 256, 256, 34, 'canny', cancel_event=cancel, progress=progress)
        self.assertEqual(list(self.root.iterdir()), [self.source])

    def test_missing_pose_is_explicit_and_no_files_created(self):
        status = preprocessor_status(self.root / 'missing-aux')
        self.assertFalse(status['pose']['ready'])
        self.assertFalse(status['depth']['ready'])
        with self.assertRaisesRegex(ValueError, 'unavailable'):
            process_control(self.source, self.root, 256, 256, 34, 'pose', aux_root=self.root / 'missing-aux')
        self.assertEqual(list(self.root.iterdir()), [self.source])

    def test_prepared_map_remains_explicit(self):
        result = process_control(self.source, self.root, 256, 256, 34, 'pose', input_type='prepared')
        self.assertEqual(result['provenance']['preprocessor'], 'user_prepared')
        self.assertEqual(result['frame_count'], 34)

    def test_unknown_automatic_map_rejected(self):
        with self.assertRaisesRegex(ValueError, 'advanced prepared'):
            process_control(self.source, self.root, 256, 256, 34, 'layout')

    def test_cache_hit_has_fresh_lease_and_bypasses_transform(self):
        first = process_control(self.source, self.root, 256, 256, 34, 'canny')
        self.assertFalse(first['provenance']['cache_hit'])
        progress = []
        with patch('cv2.Canny', side_effect=AssertionError('Transform must not run on a hit')):
            second = process_control(self.source, self.root, 256, 256, 34, 'canny', progress=lambda *args: progress.append(args))
        self.assertTrue(second['provenance']['cache_hit'])
        self.assertNotEqual(first['filename'], second['filename'])
        self.assertIn((34, 34, 'cached'), progress)
        (self.root / first['filename']).unlink()
        self.assertTrue((self.root / second['filename']).is_file())
        with patch('h3_lab.control_preprocess.preprocessor_status', return_value={'canny': {'ready': False, 'reasons': ['Missing dependency']}}):
            with self.assertRaisesRegex(ValueError, 'Missing dependency'):
                process_control(self.source, self.root, 256, 256, 34, 'canny')

    def test_changed_goal_and_span_miss(self):
        process_control(self.source, self.root, 256, 256, 34, 'canny')
        for kind, offset, length in [('gray', 0, 34), ('canny', 1/24, 34), ('canny', 0, 33)]:
            result = process_control(self.source, self.root, 256, 256, length, kind, offset=offset)
            self.assertFalse(result['provenance']['cache_hit'])

    def test_corrupted_cache_regenerates(self):
        process_control(self.source, self.root, 256, 256, 34, 'canny')
        media = next((self.root / '.h3_control_cache').glob('*.mp4'))
        with media.open('r+b') as stream:
            stream.write(b'BROKEN')
        result = process_control(self.source, self.root, 256, 256, 34, 'canny')
        self.assertFalse(result['provenance']['cache_hit'])

    def test_cached_cancel_retains_cache_and_other_lease(self):
        first = process_control(self.source, self.root, 256, 256, 34, 'canny')
        cache = self.root / '.h3_control_cache'
        before = {p.name: p.read_bytes() for p in cache.iterdir()}
        existing = set(self.root.iterdir())
        cancel = threading.Event()
        def progress(done, total, phase):
            if phase == 'cached':
                cancel.set()
        with self.assertRaisesRegex(ValueError, 'cancelled'):
            process_control(self.source, self.root, 256, 256, 34, 'canny', cancel_event=cancel, progress=progress)
        self.assertEqual(set(self.root.iterdir()), existing)
        self.assertEqual({p.name: p.read_bytes() for p in cache.iterdir()}, before)
        self.assertTrue((self.root / first['filename']).is_file())

    def test_source_size_bound_before_probe_hash_and_output(self):
        with patch('h3_lab.control_preprocess.SOURCE_MAX_BYTES', 1), patch('h3_lab.control_preprocess.video_metadata') as probe:
            with self.assertRaisesRegex(ValueError, '500 MB'):
                process_control(self.source, self.root, 256, 256, 34, 'canny')
            probe.assert_not_called()
        self.assertEqual(list(self.root.iterdir()), [self.source])

    def test_entry_quota_evicts_cache_only(self):
        with patch('h3_lab.control_preprocess.CACHE_MAX_ENTRIES', 2):
            results = [process_control(self.source, self.root, 256, 256, length, 'canny') for length in (34, 33, 32)]
        cache = self.root / '.h3_control_cache'
        self.assertEqual(len(list(cache.glob('*.json'))), 2)
        self.assertEqual(len(list(cache.glob('*.mp4'))), 2)
        self.assertLessEqual(sum(p.stat().st_size for p in cache.iterdir()), 256 * 1024 * 1024)
        self.assertTrue(all((self.root / item['filename']).is_file() for item in results))

    def test_changed_content_and_manifest_corruption_miss(self):
        process_control(self.source, self.root, 256, 256, 34, 'canny')
        with self.source.open('ab') as stream:
            stream.write(b'changed source bytes')
        result = process_control(self.source, self.root, 256, 256, 34, 'canny')
        self.assertFalse(result['provenance']['cache_hit'])
        for manifest in (self.root / '.h3_control_cache').glob('*.json'):
            manifest.write_text('[]')
        result = process_control(self.source, self.root, 256, 256, 34, 'canny')
        self.assertFalse(result['provenance']['cache_hit'])

    def test_byte_quota_removes_only_private_entries(self):
        cache = self.root / '.h3_control_cache'
        cache.mkdir()
        for index in range(3):
            key = f'{index:064x}'
            (cache / (key + '.mp4')).write_bytes(bytes(100))
            (cache / (key + '.json')).write_text('{}')
        with patch('h3_lab.control_preprocess.CACHE_MAX_BYTES', 220):
            _evict_cache(cache)
        self.assertEqual(len(list(cache.glob('*.json'))), 2)
        self.assertLessEqual(sum(item.stat().st_size for item in cache.iterdir()), 220)
        self.assertTrue(self.source.is_file())


if __name__ == '__main__':
    unittest.main()
