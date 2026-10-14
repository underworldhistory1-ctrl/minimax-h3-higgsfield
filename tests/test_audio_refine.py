import copy
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest
from unittest.mock import patch
import torch
from h3_audio_refine import H3AudioRefineMask, H3AudioRestoreVideo
from h3_lab.configuration import validate_configuration


class Packed:
    is_nested=True
    def __init__(self,parts):self.parts=parts
    def unbind(self):return self.parts


class AudioRefineTests(unittest.TestCase):
    def setUp(self):
        module=types.ModuleType('comfy.nested_tensor');module.NestedTensor=Packed
        self.context=patch.dict(sys.modules,{'comfy':types.ModuleType('comfy'),'comfy.nested_tensor':module});self.context.start();self.addCleanup(self.context.stop)
        self.video=torch.randn(1,24,7,4,6);self.audio=torch.randn(1,32,2,200)
        self.latent={'samples':Packed((self.video,self.audio)),'batch_index':[0]}
    def test_mask_is_audio_only_and_keeps_continuation_prefix(self):
        result=H3AudioRefineMask().apply(self.latent,39)[0]
        video,audio=result['noise_mask'].unbind()
        self.assertEqual(torch.count_nonzero(video),0)
        self.assertEqual(torch.count_nonzero(audio[...,:65]),0)
        self.assertTrue(torch.all(audio[...,65:]==1))
        self.assertNotIn('noise_mask',self.latent);self.assertIs(result['samples'],self.latent['samples'])
    def test_exact_video_and_audio_prefix_restored_despite_sampler_drift(self):
        before=self.video.clone();new_audio=self.audio+1
        refined={'samples':Packed((self.video+3,new_audio)),'noise_mask':'remove'}
        result=H3AudioRestoreVideo().restore(self.latent,refined,39)[0]
        video,audio=result['samples'].unbind()
        self.assertTrue(torch.equal(video,before));self.assertIs(video,self.video)
        self.assertTrue(torch.equal(audio[...,:65],self.audio[...,:65]))
        self.assertTrue(torch.equal(audio[...,65:],new_audio[...,65:]))
        self.assertNotIn('noise_mask',result);self.assertTrue(torch.equal(new_audio,self.audio+1))
    def test_invalid_or_nonfinite_streams_fail_closed(self):
        for frames in (-1,True,400):
            with self.assertRaises(ValueError):H3AudioRefineMask().apply(self.latent,frames)
        with self.assertRaises(ValueError):H3AudioRefineMask().apply({'samples':self.video})
        with self.assertRaises(ValueError):H3AudioRestoreVideo().restore(self.latent,{'samples':Packed((self.video,self.audio*float('nan')))})
        with self.assertRaises(ValueError):H3AudioRestoreVideo().restore(self.latent,{'samples':Packed((self.video,self.audio[...,:10]))})
    def spec(self,**updates):
        spec={'model_profile':'original','mode':'text','seed':'18446744073709551615','audio_refinement':{'enabled':True},**updates}
        script="const s="+json.dumps(spec)+";s.workflow=require('./web/h3/graph-builder').buildGraph(s,{}, {audio_refine_ready:true,refine_ready:true,sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple']}});console.log(JSON.stringify(s));"
        return json.loads(subprocess.check_output(['node','-e',script],cwd=Path(__file__).resolve().parents[1],text=True))
    def test_real_builder_and_admission_with_image_refinement(self):
        for image_refine in (False,True):
            spec=self.spec(enable_refine=image_refine);validate_configuration(spec,{'audio_refine_ready':True})
    def test_tampered_stage_is_rejected(self):
        spec=self.spec();sampler=next(n for n in spec['workflow'].values() if n.get('inputs',{}).get('latent_image',[None])[0]=='180')
        for key,value in [('cfg',2),('model',['8',0]),('denoise',.9),('seed',42)]:
            bad=copy.deepcopy(spec);next(n for n in bad['workflow'].values() if n.get('inputs',{}).get('latent_image',[None])[0]=='180')['inputs'][key]=value
            with self.assertRaises(ValueError):validate_configuration(bad,{'audio_refine_ready':True})
        with self.assertRaises(ValueError):validate_configuration(spec,{'audio_refine_ready':False})
        with self.assertRaises(ValueError):validate_configuration({**spec,'preserve_reference_audio':'source'}, {'audio_refine_ready':True})

    def test_audio_cannot_bypass_declared_image_refinement(self):
        spec=self.spec(enable_refine=True)
        for node in spec['workflow'].values():
            if node.get('class_type')=='H3StudioAudioRefineMask':node['inputs']['latent']=['8',0]
            if node.get('class_type')=='H3StudioAudioRestoreVideo':node['inputs']['source']=['8',0]
        with self.assertRaisesRegex(ValueError,'final image refinement'):
            validate_configuration(spec,{'audio_refine_ready':True})
