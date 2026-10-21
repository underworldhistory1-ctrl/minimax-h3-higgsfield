import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
module_spec = importlib.util.spec_from_file_location('turbo_configuration', ROOT / 'h3_lab/configuration.py')
config = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(config)


def valid_spec():
    return {'model_profile':'original', 'mode':'text', 'render_method':'turbo', 'steps':6,
        'sampling':{'sampler_name':'h3_turbo','scheduler':'simple','cfg':1,'denoise':1,'shift_video':12,'shift_audio':3},
        'workflow':{
            '1':{'class_type':'UNETLoader','inputs':{'unet_name':config.FL}},
            '2':{'class_type':'MiniMaxH3SigmaShift','inputs':{'model':['50',0],'shift_video':12,'shift_audio':3}},
            '6':{'class_type':'MiniMaxH3ImageToVideo','inputs':{}},
            '8':{'class_type':'KSampler','inputs':{'model':['2',0],'sampler_name':'h3_turbo','scheduler':'simple','cfg':1,'denoise':1,'steps':6}},
            '50':{'class_type':'MiniMaxH3TurboLoRA','inputs':{'model':['1',0],'lora_name':'minimax_h3_turbo_v4_step600_ema.safetensors','strength':1,'low_vram':False}}}}

class TurboAdmissionTests(unittest.TestCase):
    def test_reference_turbo_exact_adapter_and_8step_contract(self):
        spec=valid_spec();spec['mode']='refs';spec['render_method']='turbo_ref';spec['steps']=8
        spec['sampling']['sampler_name']='euler'
        graph=spec['workflow'];graph['1']['inputs']['unet_name']=config.REF;graph['6']['class_type']='MiniMaxH3ReferenceToVideo'
        graph['8']['inputs'].update(sampler_name='euler',steps=8)
        graph['50']={'class_type':'LoraLoaderModelOnly','inputs':{'model':['1',0],'lora_name':'minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors','strength_model':1}}
        config.validate_configuration(spec, {'turbo_ref_ready':True})
        spec['steps']=6;graph['8']['inputs']['steps']=6
        with self.assertRaises(ValueError):config.validate_configuration(spec, {'turbo_ref_ready':True})

    def test_correct_graph_and_settings(self):
        config.validate_configuration(valid_spec(), {'turbo_ready':True})
    def test_missing_contract_cannot_bypass_turbo_checks(self):
        for marked in (True, False):
            spec=valid_spec();spec.pop('model_profile');spec.pop('sampling')
            if not marked:spec.pop('render_method')
            with self.assertRaisesRegex(ValueError,'explicit configuration'):
                config.validate_configuration(spec, {})
    def test_unavailable_or_tampered_adapter_or_sampler(self):
        with self.assertRaises(ValueError):config.validate_configuration(valid_spec(), {})
        for key,value in [('strength',.9),('low_vram',True),('lora_name','other.safetensors'),('model',['2',0])]:
            spec=valid_spec();spec['workflow']['50']['inputs'][key]=value
            with self.assertRaises(ValueError):config.validate_configuration(spec, {'turbo_ready':True})
        spec=valid_spec();spec['workflow']['8']['inputs']['sampler_name']='euler'
        with self.assertRaises(ValueError):config.validate_configuration(spec, {'turbo_ready':True})
    def test_extra_passes_and_adapters_rejected(self):
        for key,value in [('refine',True),('control',{'enabled':True}),('audio_refinement',{'enabled':True}),('loras',[{'enabled':True,'name':'Realism'}])]:
            spec=valid_spec();spec[key]=value
            with self.assertRaises(ValueError):config.validate_configuration(spec, {'turbo_ready':True})

if __name__=='__main__':unittest.main()
