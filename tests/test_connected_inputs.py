"""Regressions for saved image controls and selected conditioning/output paths."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image
from h3_lab.images import resolve_image
from h3_lab.configuration import validate_configuration


class ConnectedInputTests(unittest.TestCase):
    def test_saved_reference_auto_fit_preserves_original_and_can_be_disabled(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'original.png'
            Image.new('RGB', (4096, 2048), 'blue').save(source)
            original = source.read_bytes()
            for resize, dimensions in [(True, (2048, 1024)), (False, (4096, 2048))]:
                resolved = resolve_image(source, root/'input', 'asset', {'fit': 'preserve', 'resize': resize})
                with Image.open(root/'input'/resolved['filename']) as image:
                    self.assertEqual(image.size, dimensions)
                self.assertEqual((resolved['width'], resolved['height']), dimensions)
                self.assertEqual(resolved['resized'], resize)
            self.assertEqual(source.read_bytes(), original)

    def test_auto_fit_accepts_cmyk_jpeg_and_keeps_rgba_transparency(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for mode, suffix, color in [('CMYK', '.jpg', (0, 255, 255, 0)), ('RGBA', '.png', (255, 0, 0, 40))]:
                source = root / ('original' + suffix)
                Image.new(mode, (4096, 2048), color).save(source)
                resolved = resolve_image(source, root/'input', mode, {'resize': True})
                with Image.open(root/'input'/resolved['filename']) as image:
                    self.assertEqual(image.size, (2048, 1024))
                    self.assertEqual(image.mode, 'RGB' if mode == 'CMYK' else 'RGBA')
                    if mode == 'RGBA':
                        self.assertEqual(image.getpixel((0, 0))[3], 40)

    def test_guide_reference_detail_and_output_transforms_must_match_selection(self):
        script = """const B=require('./web/h3/graph-builder');const caps={add_guide:true,refine_ready:true};const specs=[];
for(const [width,height] of [[1280,704],[1920,1080],[1080,1920],[1664,928]])for(const enable_refine of [false,true]){
const spec={model_profile:'original',mode:'refs',width,height,enable_refine,ref_image_size:'max',guides:[{alias:'guide',frame_idx:24}],references:[{kind:'image',alias:'hero'}]};spec.workflow=B.buildGraph(spec,{hero:'hero.png',guide:'guide.png'},caps);specs.push(spec);}console.log(JSON.stringify({specs,caps}));"""
        data = json.loads(subprocess.check_output(['node', '-e', script], text=True))
        for spec in data['specs']:
            validate_configuration(spec, data['caps'])
            graph = spec['workflow']
            guide_id = next(key for key, n in graph.items() if n['class_type'] == 'MiniMaxH3AddGuide')
            for frame in [-1, 1000000]:
                bad = copy.deepcopy(spec)
                bad['guides'][0]['frame_idx'] = frame
                bad['workflow'][guide_id]['inputs']['frame_idx'] = frame
                with self.assertRaisesRegex(ValueError, 'outside the selected timeline'):
                    validate_configuration(bad, data['caps'])
            mutations = [
                lambda g: g[guide_id]['inputs'].update(frame_idx=96),
                lambda g: g[guide_id]['inputs'].update(latent=['8', 0]),
                lambda g: g['6']['inputs'].update(ref_image_size='match'),
                lambda g: g['11']['inputs'].update(images=['9', 0])
            ]
            if (spec['width'],spec['height']) == (1280,704):
                mutations.pop()  # No spatial transform is requested for this canvas.
            elif not spec['enable_refine'] and spec['width'] == 1664:
                mutations.pop()
            for mutate in mutations:
                bad = copy.deepcopy(spec)
                mutate(bad['workflow'])
                with self.subTest(width=spec['width'], refine=spec['enable_refine']):
                    with self.assertRaises(ValueError):
                        validate_configuration(bad, data['caps'])
