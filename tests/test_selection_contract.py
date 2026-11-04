"""Use real browser-built graphs, then mutate execution without changing UI intent."""
import copy
import json
import subprocess
import unittest
from h3_lab.configuration import validate_configuration


class SelectionContractTests(unittest.TestCase):
    def test_expanded_profiles_passes_dials_guides_and_managed_adapters(self):
        data=json.loads(subprocess.check_output(['node','tests/fixtures/selection_matrix.cjs'],text=True))
        self.assertEqual(len(data['specs']),2096)
        for index,spec in enumerate(data['specs']):
            with self.subTest(index=index,profile=spec['model_profile'],mode=spec['mode'],method=spec['render_method']):
                validate_configuration(spec,data['caps'])

    def test_supported_selection_matrix_matches_backend(self):
        script="""const C=require('./web/h3/configuration'),B=require('./web/h3/graph-builder');
const caps={sampling_options:{samplers:['res_multistep','euler'],schedulers:['simple'],weight_dtypes:['default']},refine_ready:true,audio_refine_ready:true,hybrid_loader_ready:true,model_catalog:[{name:'community.safetensors',profiles:['singularity']},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader']}]};const specs=[];
for(const model_profile of Object.keys(C.profiles))for(const mode of ['text','frames','refs'])for(const render_method of ['native','spectrum','motioncache'])for(const adapter of ['none','Motion_Repair_V2.safetensors',C.CHARACTER_SWAP,C.ANIME_TO_REALISM,'H3_Combat_V2.safetensors'])for(const enable_refine of [false,true])for(const audio of [false,true]){
if(mode!=='refs'&&[C.CHARACTER_SWAP,C.ANIME_TO_REALISM].includes(adapter))continue;
const spec={model_profile,checkpoint:'community.safetensors',mode,render_method,enable_refine,audio_refinement:{enabled:audio},frames:{first:'first'},references:[{kind:'image',alias:'hero'},{kind:'video',alias:'shot',fps:24,frame_count:124,use_audio:true},{kind:'audio',alias:'sound'}],loras:adapter==='none'?[]:[{name:adapter,enabled:true,strength:.8}]};spec.workflow=B.buildGraph(spec,{first:'first.png',hero:'hero.png',shot:'shot.mp4',sound:'sound.wav'},caps);specs.push(spec);}console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        self.assertEqual(len(data['specs']),528)
        for spec in data['specs']:
            with self.subTest(profile=spec['model_profile'],mode=spec['mode'],method=spec['render_method'],loras=spec['loras'],refine=spec['enable_refine'],audio=spec['audio_refinement']):
                validate_configuration(spec,data['caps'])

    def test_selected_settings_and_passes_must_reach_the_output(self):
        script="""const B=require('./web/h3/graph-builder');const caps={refine_ready:true};const specs=[];
for(const method of ['native','spectrum','motioncache'])for(const refine of [false,true]){
const s={model_profile:'original',mode:'text',render_method:method,width:1280,height:704,target_frames:124,seed:42,compiled_prompt:'A person walks.',enable_refine:refine,loras:[{name:'style.safetensors',enabled:true,strength:.8}]};s.workflow=B.buildGraph(s,{},caps);specs.push(s);}console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        for spec in data['specs']:
            validate_configuration(spec,data['caps'])
            mutations=[('canvas',lambda g:g['6']['inputs'].update(width=640)),('seed',lambda g:g['8']['inputs'].update(seed=999)),('prompt',lambda g:g['6']['inputs'].update(prompt='Another scene.')),('frames',lambda g:g['6']['inputs'].update(length=362)),('lora',lambda g:g['2']['inputs'].update(model=['1',0])),('decode',lambda g:g['9']['inputs'].update(samples=['8',0])),('conditioning',lambda g:g['8']['inputs'].update(positive=['7',0])),('latent_cycle',lambda g:g['8']['inputs'].update(latent_image=['8',0])),('default_sampling',lambda g:g['8']['inputs'].update(cfg=99))]
            if spec['render_method']!='native':mutations.append(('acceleration',lambda g:g['8']['inputs'].update(model=['2',0])))
            if spec['enable_refine']:
                mutations.append(('refinement',lambda g:g['13']['inputs'].update(samples=['8',0])))
                mutations.append(('empty_refine_link',lambda g:g[g['13']['inputs']['samples'][0]]['inputs'].update(latent_image=[])))
                mutations.append(('refine_defaults',lambda g:g[g['13']['inputs']['samples'][0]]['inputs'].update(cfg=99)))
            for name,mutate in mutations:
                with self.subTest(method=spec['render_method'],refine=spec['enable_refine'],mutation=name):
                    bad=copy.deepcopy(spec);mutate(bad['workflow'])
                    with self.assertRaises(ValueError):validate_configuration(bad,data['caps'])
