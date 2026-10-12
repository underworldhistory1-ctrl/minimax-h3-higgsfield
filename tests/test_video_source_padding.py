import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock
from h3_lab.video_source import prepare_video_source


class SourcePaddingTests(unittest.TestCase):
    def test_audio_padding_has_finite_duration_without_running_ffmpeg(self):
        probe = {'format': {'format_name': 'mov,mp4', 'duration': '3'}, 'streams': [
            {'codec_type':'video','width':256,'height':256,'duration':'3'}, {'codec_type':'audio'}]}
        decoded = {'streams':[{'codec_type':'video','nb_read_frames':'48'}, {'codec_type':'audio'}]}
        with tempfile.TemporaryDirectory() as directory, \
             patch('h3_lab.video_source.require_cpu_headroom'), \
             patch('h3_lab.video_source.get_ffprobe_path', return_value='ffprobe'), \
             patch('h3_lab.video_source.get_ffmpeg_path', return_value='ffmpeg'), \
             patch('h3_lab.video_source.inspect_media', return_value=decoded), \
             patch('h3_lab.video_source.subprocess.run', side_effect=[Mock(stdout=json.dumps(probe)), Mock()]) as run:
            result = prepare_video_source('fixture.mp4', Path(directory)/'prepared.mp4',256,256,2)
            command = run.call_args.args[0]
            audio = command[command.index('-af')+1]
            self.assertIn('apad=whole_dur=2.0,atrim=duration=2.0', audio)
            self.assertNotIn(',apad,', audio)
            self.assertEqual(result['frame_count'],48)
