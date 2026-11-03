import copy
import unittest
from h3_lab.configuration import PIKA, FL, REF, validate_configuration

class PikaTests(unittest.TestCase):
    def spec(self,name,steps,family):
        shifts={'shift_video':12 if family=='ref2va' else 6,'shift_audio':3}
        sampling={'sampler_name':'euler','scheduler':'simple','cfg':1,'denoise':1,**shifts}
        return {'model_profile':'original','mode':'refs' if family=='ref2va' else 'text','render_method':'native','steps':steps,'sampling':sampling,'loras':[{'name':name,'enabled':True,'strength':1}], 'workflow':{
            '1':{'class_type':'UNETLoader','inputs':{'unet_name':REF if family=='ref2va' else FL}},
            '2':{'class_type':'MiniMaxH3SigmaShift','inputs':{'model':['50',0],**shifts}},
            '6':{'class_type':'MiniMaxH3ReferenceToVideo' if family=='ref2va' else 'MiniMaxH3ImageToVideo','inputs':{}},
            '8':{'class_type':'KSampler','inputs':{'model':['2',0],'steps':steps,**{k:v for k,v in sampling.items() if not k.startswith('shift_')}}},
            '13':{'inputs':{'samples':['8',0]}},'9':{'inputs':{'samples':['13',0]}},'10':{'inputs':{'samples':['13',0]}},
            '50':{'class_type':'LoraLoaderModelOnly','inputs':{'model':['1',0],'lora_name':name,'strength_model':1}}}}
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
