"""Reject selected-input and final-pass mutations of actual browser-built graphs."""
import copy
import json
import subprocess
import unittest
from h3_lab.configuration import validate_configuration


class ExecutionInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        script="""const B=require('./web/h3/graph-builder');
const caps={continuation_ready:true,refine_ready:true,guide_audio:true,guide_video:true};
const common={model_profile:'original',mode:'text',target_frames:124,seed:'18446744073709551615'};
const specs=[{...common,mode:'frames',frames:{first:{filename:'first.png'},last:{filename:'last.png'}}},
{...common,mode:'refs',references:[{kind:'image',alias:'hero',filename:'hero.png'},{kind:'video',alias:'move',filename:'move.mp4',fps:24,frame_count:124,use_audio:true},{kind:'audio',alias:'voice',filename:'voice.wav'}]},
{...common,continuation:{type:'generated',source_token:'owned_source',context_length:39,source_model:'minimax_h3_fl2va_pruned_int8_convrot.safetensors',source_canvas:{width:1280,height:704}}},
{...common,continuation:{type:'imported',source_file:'owned.mp4',context_length:39}},
{...common,enable_refine:true},common];
for(const s of specs)s.workflow=B.buildGraph(s,{first:'first.png',last:'last.png',hero:'hero.png',move:'move.mp4',voice:'voice.wav'},caps);
console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        cls.specs=data['specs'];cls.caps=data['caps']

    def reject(self,index,mutate,caps=None):
        spec=copy.deepcopy(self.specs[index]);mutate(spec['workflow'])
        with self.assertRaises(ValueError):validate_configuration(spec,caps or self.caps)

    def test_valid_browser_paths(self):
        for spec in self.specs:validate_configuration(spec,self.caps)

    def test_frames_and_all_reference_slots_are_required(self):
        self.reject(0,lambda g:g['6']['inputs'].pop('first_frame'))
        self.reject(0,lambda g:g['6']['inputs'].update(last_frame=['15',0]))
        for slot in ['ref_images.ref_image_0','ref_videos.ref_video_0','ref_video_audios.ref_video_audio_0','ref_audios.ref_audio_0']:
            with self.subTest(slot=slot):self.reject(1,lambda g:g['6']['inputs'].pop(slot))
        self.reject(1,lambda g:g['6']['inputs'].update({'ref_images.ref_image_1':g['6']['inputs']['ref_images.ref_image_0']}))
        self.reject(1,lambda g:g[g['6']['inputs']['ref_images.ref_image_0'][0]]['inputs'].update(image='wrong_person.png'))
        self.reject(1,lambda g:g[g['6']['inputs']['ref_video_audios.ref_video_audio_0'][0]]['inputs'].update(duration=1))

    def test_continuation_source_context_trim_and_capability_are_exact(self):
        for index in (2,3):
            context=next(k for k,n in self.specs[index]['workflow'].items() if n['class_type'].endswith('MaskedContext'))
            trim=next(k for k,n in self.specs[index]['workflow'].items() if n['class_type']=='H3LabTrimAV')
            self.reject(index,lambda g:g[context]['inputs'].update(context_length=90))
            self.reject(index,lambda g:g[context]['inputs'].update(audio_feather_ticks=99))
            self.reject(index,lambda g:g[trim]['inputs'].update(trim_frames=0))
            self.reject(index,lambda g:g['11']['inputs'].update(audio=['10',0]))
            self.reject(index,lambda g:None,{**self.caps,'continuation_ready':False})
        self.reject(2,lambda g:next(n for n in g.values() if n['class_type']=='H3LabLoadContext')['inputs'].update(token='wrong_source'))
        self.reject(3,lambda g:next(n for n in g.values() if n['class_type']=='LoadVideo')['inputs'].update(file='wrong.mp4'))

    def test_refinement_seed_conditioning_and_fixed_upscaler(self):
        sampler=self.specs[4]['workflow']['13']['inputs']['samples'][0]
        for field,value in [('seed',999),('positive',['7',0]),('negative',['6',0])]:self.reject(4,lambda g:g[sampler]['inputs'].update({field:value}))
        for field,value in [('model_name','wrong.safetensors'),('mode.scale',1),('align',16),('device','cpu')]:
            self.reject(4,lambda g:next(n for n in g.values() if n['class_type']=='MinimaxH3LatentUpscaler3D')['inputs'].update({field:value}))
        self.reject(4,lambda g:None,{**self.caps,'refine_ready':False})

    def test_model_wrappers_and_core_vae_cannot_bypass_selected_settings(self):
        def extra_shift(g):
            g['999']={'class_type':'MiniMaxH3SigmaShift','inputs':{'model':['2',0],'shift_video':99,'shift_audio':99}}
            g['8']['inputs']['model']=['999',0]
        self.reject(5,extra_shift)
        for index in range(len(self.specs)):
            self.reject(index,lambda g:g['9']['inputs'].update(vae=['5',0]))
            self.reject(index,lambda g:g['6']['inputs'].update(clip=['4',0]))
            self.reject(index,lambda g:g['4']['inputs'].update(vae_name='wrong.safetensors'))

    def test_malformed_frames_are_a_validation_error(self):
        for value in ([],['bad'],True,'first'):
            spec={**self.specs[0],'frames':value}
            with self.assertRaises(ValueError):validate_configuration(spec,self.caps)

    def test_guide_sources_and_accelerator_defaults_are_bound(self):
        script="""const B=require('./web/h3/graph-builder');const caps={guide_video:true,guide_audio:true};let specs=[];
for(const kind of ['image','video','audio']){const s={model_profile:'original',mode:'text',guides:[{kind,filename:kind==='image'?'g.png':kind==='audio'?'g.wav':'g.mp4',frame_idx:17,fps:24,frame_count:39,use_audio:kind==='video'}]};s.workflow=B.buildGraph(s,{},caps);specs.push(s);}
for(const render_method of ['spectrum','motioncache']){const s={model_profile:'original',render_method};s.workflow=B.buildGraph(s);specs.push(s);}console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        for spec in data['specs']:
            validate_configuration(spec,data['caps']);bad=copy.deepcopy(spec)
            if spec.get('guides'):
                loader=next(n for n in bad['workflow'].values() if n['class_type'] in ('LoadImage','LoadAudio','LoadVideo'))
                loader['inputs'][next(iter(loader['inputs']))]='wrong_source.bin'
            else:
                patch=next(n for n in bad['workflow'].values() if n['class_type'] in ('SpectrumApplyMiniMaxH3','MiniMaxH3MotionCache'))
                patch['inputs']['blend_weight' if spec['render_method']=='spectrum' else 'reuse_threshold']=.99
            with self.assertRaises(ValueError):validate_configuration(bad,data['caps'])

    def test_preserved_audio_must_cover_the_full_output(self):
        spec=copy.deepcopy(self.specs[1]);spec['preserve_reference_audio']='move';g=spec['workflow'];g['11']['inputs']['audio']=g['6']['inputs']['ref_video_audios.ref_video_audio_0']
        validate_configuration(spec,self.caps)
        spec['references'][1]['frame_count']=39;g[g['6']['inputs']['ref_videos.ref_video_0'][0]]['inputs']['length']=39;g[g['11']['inputs']['audio'][0]]['inputs']['duration']=39/24
        with self.assertRaises(ValueError):validate_configuration(spec,self.caps)
