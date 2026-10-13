import pathlib,tempfile,unittest,concurrent.futures
from PIL import Image
from h3_lab.assets import AssetService
class ThumbnailTests(unittest.TestCase):
    def test_cached_preview_is_bounded_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);source=root/'portrait.png'
            Image.new('RGBA',(1800,2400),(255,0,0,128)).save(source)
            before=source.read_bytes();service=AssetService(str(root/'store'))
            asset=service.register_asset(str(source),'image',source.name,'project')
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                paths=list(pool.map(lambda _:service.image_thumbnail(asset['asset_id']),range(8)))
            self.assertEqual(len(set(paths)),1)
            with Image.open(paths[0]) as preview:
                self.assertEqual(preview.size,(180,240));self.assertEqual(preview.mode,'RGB')
            self.assertLess(paths[0].stat().st_size,len(before))
            self.assertEqual(source.read_bytes(),before)
            timestamp=paths[0].stat().st_mtime_ns
            self.assertEqual(service.image_thumbnail(asset['asset_id']).stat().st_mtime_ns,timestamp)
            with self.assertRaises(ValueError):service.image_thumbnail('../outside')
    def test_exif_orientation_and_invalid_media(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);source=root/'rotated.jpg';image=Image.new('RGB',(600,300),'blue')
            exif=Image.Exif();exif[274]=6;image.save(source,exif=exif)
            service=AssetService(str(root/'store'));asset=service.register_asset(str(source),'image',source.name,'project')
            with Image.open(service.image_thumbnail(asset['asset_id'])) as preview:self.assertEqual(preview.size,(120,240))
            audio=root/'audio.wav';audio.write_bytes(b'not an image');record=service.register_asset(str(audio),'audio',audio.name,'project')
            with self.assertRaises(ValueError):service.image_thumbnail(record['asset_id'])
