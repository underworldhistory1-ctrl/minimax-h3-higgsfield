import copy
import unittest
from h3_lab.configuration import PIKA, FL, REF, validate_configuration

class PikaTests(unittest.TestCase):
    def spec(self,name,steps,family):
        shifts={'shift_video':12 if family=='ref2va' else 6,'shift_audio':3}
        sampling={'sampler_name':'euler','scheduler':'simple','cfg':1,'denoise':1,**shifts}
        import json,subprocess
        spec={'model_profile':'original','mode':'refs' if family=='ref2va' else 'text','render_method':'native','steps':steps,'sampling':sampling,'loras':[{'name':name,'enabled':True,'strength':1}], 'references':[{'kind':'image','alias':'hero'}]}
        script="const s=JSON.parse(process.argv[1]);s.workflow=require('./web/h3/graph-builder').buildGraph(s,{hero:'hero.png'},{sampling_options:{samplers:['euler'],schedulers:['simple'],weight_dtypes:['default']}});console.log(JSON.stringify(s));"
        return json.loads(subprocess.check_output(['node','-e',script,json.dumps(spec)],text=True))
    def test_all_four_native_adapters(self):
        for name,(steps,family) in PIKA.items():
            with self.subTest(name=name):validate_configuration(self.spec(name,steps,family),{})
    def test_mismatched_and_hidden_graph_changes_rejected(self):
        name=next(iter(PIKA));steps,family=PIKA[name];base=self.spec(name,steps,family)
        for key,value in [('steps',20),('model_profile','singularity'),('mode','refs'),('enable_refine',True),('render_method','spectrum')]:
            spec=copy.deepcopy(base);spec[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):validate_configuration(spec,{})
        for node,field,value in [('50','strength_model',.5),('50','model',['2',0]),('2','shift_video',12),('8','steps',20)]:
            spec=copy.deepcopy(base);spec['workflow'][node]['inputs'][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_configuration(spec,{})
        spec=copy.deepcopy(base);spec.pop('model_profile')
        with self.assertRaises(ValueError):validate_configuration(spec,{})

    def test_extra_sampler_or_decode_bypass_rejected(self):
        name=next(iter(PIKA));steps,family=PIKA[name]
        spec=self.spec(name,steps,family);spec['workflow']['51']={'class_type':'KSamplerAdvanced','inputs':{}}
        with self.assertRaises(ValueError):validate_configuration(spec,{})
        spec=self.spec(name,steps,family);spec['workflow']['13']['inputs']['samples']=['51',0]
        with self.assertRaises(ValueError):validate_configuration(spec,{})
