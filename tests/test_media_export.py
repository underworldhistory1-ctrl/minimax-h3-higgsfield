import hashlib
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from h3_lab.assembly import get_ffmpeg_path
from h3_lab.media_export import upscale_take


class TestSameTakeUpscale(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.directory.name)
        self.source = self.root / "source.mp4"
        subprocess.run([get_ffmpeg_path(), "-v", "error", "-y", "-f", "lavfi", "-i",
            "testsrc2=size=96x64:rate=24:duration=0.5", "-f", "lavfi", "-i",
            "sine=frequency=440:sample_rate=48000:duration=0.5", "-c:v", "libx264",
            "-c:a", "aac", "-pix_fmt", "yuv420p", str(self.source)], check=True, capture_output=True)

    def tearDown(self):
        self.directory.cleanup()

    def audio_packets(self, path):
        return subprocess.check_output([get_ffmpeg_path(), "-v", "error", "-i", str(path),
            "-map", "0:a:0", "-c", "copy", "-f", "framemd5", "-"])

    def test_real_export_keeps_audio_packets_timing_frames_and_original(self):
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        output = self.root / "result.mp4"
        result = upscale_take(self.source, output)
        self.assertEqual((result["width"], result["height"], result["frames"]), (192, 128, 12))
        self.assertTrue(result["audio_preserved"])
        self.assertFalse(result["generation_performed"])
        self.assertEqual(self.audio_packets(self.source), self.audio_packets(output))
        self.assertEqual(before, hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual(list(self.root.glob("*.part.mp4")), [])

    def test_video_without_audio_is_supported(self):
        muted = self.root / "muted.mp4"
        subprocess.run([get_ffmpeg_path(), "-v", "error", "-i", str(self.source),
            "-an", "-c:v", "copy", str(muted)], capture_output=True, check=True)
        self.assertFalse(upscale_take(muted, self.root / "out.mp4")["audio_preserved"])

    def test_non_square_pixels_keep_display_aspect_ratio(self):
        from h3_lab.assembly import inspect_media
        anamorphic = self.root / "anamorphic.mp4"
        subprocess.run([get_ffmpeg_path(), "-v", "error", "-i", str(self.source),
            "-vf", "setsar=2", "-c:v", "libx264", "-c:a", "copy", str(anamorphic)],
            capture_output=True, check=True)
        output = self.root / "out.mp4"
        upscale_take(anamorphic, output)
        video = next(s for s in inspect_media(output)["streams"] if s["codec_type"] == "video")
        self.assertEqual(video["sample_aspect_ratio"], "2:1")

    def test_invalid_target_and_downscale_are_rejected(self):
        for target in ("shell;command", "bad", 2, None, [], {}):
            with self.assertRaises(ValueError):
                upscale_take(self.source, self.root / "out.mp4", target)
        with patch("h3_lab.media_export.inspect_media", return_value={"streams": [
                {"codec_type": "video", "width": 1920, "height": 1080}]}):
            with self.assertRaisesRegex(ValueError, "larger"):
                upscale_take(self.source, self.root / "out.mp4", "1080")

    def test_verification_failure_never_publishes_partial_export(self):
        from h3_lab.assembly import inspect_media
        original = inspect_media(self.source)
        output = self.root / "out.mp4"
        def broken_probe(path):
            if str(path) == str(self.source):
                return original
            result = inspect_media(path)
            result["streams"][0]["nb_read_frames"] = "11"
            return result
        with patch("h3_lab.media_export.inspect_media", side_effect=broken_probe):
            with self.assertRaisesRegex(ValueError, "frame count"):
                upscale_take(self.source, output)
        self.assertFalse(output.exists())
        self.assertEqual(list(self.root.glob("*.part.mp4")), [])
