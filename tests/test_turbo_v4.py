import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
from h3_lab import configuration as config


def valid_spec():
    import json, subprocess
    script="const s={model_profile:'original',mode:'text',render_method:'turbo',steps:6,sampling:{sampler_name:'h3_turbo',scheduler:'simple',cfg:1,denoise:1,shift_video:12,shift_audio:3}};s.workflow=require('./web/h3/graph-builder').buildGraph(s,{}, {turbo_ready:true,sampling_options:{samplers:['h3_turbo'],schedulers:['simple'],weight_dtypes:['default']}});console.log(JSON.stringify(s));"
    return json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))


class TurboAdmissionTests(unittest.TestCase):
    def test_reference_turbo_exact_adapter_and_8step_contract(self):
        import json, subprocess
        script="const s={model_profile:'original',mode:'refs',references:[{kind:'image',alias:'hero'}],render_method:'turbo_ref',steps:8,sampling:{sampler_name:'euler',scheduler:'simple',cfg:1,denoise:1,shift_video:12,shift_audio:3}};s.workflow=require('./web/h3/graph-builder').buildGraph(s,{hero:'hero.png'}, {turbo_ref_ready:true,sampling_options:{samplers:['euler'],schedulers:['simple'],weight_dtypes:['default']}});console.log(JSON.stringify(s));"
        spec=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))
        graph=spec['workflow']
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
