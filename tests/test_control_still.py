import pathlib
import shutil
import tempfile
import unittest
from PIL import Image
from h3_lab.control import video_metadata
from h3_lab.control_preprocess import process_control

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class StillControlTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        self.image=self.root/'still.png'
        image=Image.new('RGB',(320,256),'black')
        for x in range(60,200):
            for y in range(40,180): image.putpixel((x,y),(255,255,255))
        image.save(self.image)

    def test_image_extracts_exact_static_control_and_source(self):
        result=process_control(self.image,self.root,256,256,34,'canny',input_type='image')
        self.assertEqual(result['input_type'],'image')
        self.assertEqual(result['provenance']['temporal_mode'],'hold_still')
        self.assertEqual(video_metadata(self.root/result['filename']),{'width':256,'height':256,'fps':24.0,'frame_count':34})
        self.assertTrue((self.root/result['source_file']).is_file())
        import cv2
        capture=cv2.VideoCapture(str(self.root/result['filename']))
        ok,first=capture.read();self.assertTrue(ok);last=first
        for _ in range(33): ok,last=capture.read();self.assertTrue(ok)
        capture.release()
        self.assertLess(abs(first.astype(float)-last).mean(),2)
        self.assertGreater(first.std(),5)

    def test_prepared_image_preserves_map_without_reextracting(self):
        result=process_control(self.image,self.root,256,256,34,'scribble',input_type='prepared_image')
        self.assertEqual(result['provenance']['preprocessor'],'user_prepared')
        self.assertEqual(result['frame_count'],34)

    def test_animated_image_and_nonzero_offset_are_rejected(self):
        gif=self.root/'animated.gif'
        Image.new('RGB',(256,256),'black').save(gif,save_all=True,append_images=[Image.new('RGB',(256,256),'white')],duration=100,loop=0)
        for source,offset in [(gif,0),(self.image,1)]:
            with self.assertRaises(ValueError):process_control(source,self.root,256,256,34,'gray',input_type='image',offset=offset)
        self.assertFalse(list(self.root.glob('h3_studio_kf_*')))

    def test_image_inpaint_requires_separate_video_mask_workflow(self):
        with self.assertRaises(ValueError):process_control(self.image,self.root,256,256,34,'inpaint',input_type='prepared_image')

if __name__=='__main__':unittest.main()
