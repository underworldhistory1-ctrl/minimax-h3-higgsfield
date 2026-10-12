import unittest
from h3_lab.jobs import validate_resource_contract


class PortraitResourceTests(unittest.TestCase):
    def spec(self, width=1088, height=1920, length=362, batch=1):
        return {'workflow': {'source': {'class_type':'MiniMaxH3ImageToVideo',
            'inputs': {'width':width,'height':height,'length':length,'batch_size':batch}}}}

    def test_portrait_and_landscape_use_same_capacity_contract(self):
        validate_resource_contract(self.spec())
        validate_resource_contract(self.spec(1920,1088))
        for values in ({'width':1080}, {'height':1952}, {'length':379}, {'batch':2}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                validate_resource_contract(self.spec(**values))

    def test_portrait_refinement_retains_bounded_multiplier(self):
        spec=self.spec()
        spec['workflow']['refine']={'class_type':'MinimaxH3LatentUpscaler3D',
            'inputs': {'mode':'scale by multiplier','mode.scale':1.25}}
        validate_resource_contract(spec)
        spec['workflow']['refine']['inputs']['mode.scale']=2
        with self.assertRaises(ValueError):
            validate_resource_contract(spec)
