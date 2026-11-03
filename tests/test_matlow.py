import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch


class MatlowTests(unittest.TestCase):
    def test_installed_packs_remain_managed_after_configuration_reset(self):
        from deploy.matlow import requested, PACKS
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for item in PACKS.values():(root/'custom_nodes'/item['directory']).mkdir(parents=True)
            self.assertTrue(requested(root,Mock(matlow=False),{'stages':{}}))

    def test_dials_and_control_pass_both_validators(self):
        import subprocess
        from h3_lab.configuration import validate_configuration
        from h3_lab.control import validate_control_graph
        script="""const B=require('./web/h3/graph-builder');const caps={controlnet_ready:true,dials_ready:true,dial_files:['dials/h3_motion.safetensors']};const s={model_profile:'original',mode:'text',width:864,height:480,target_frames:124,dials:[{name:caps.dial_files[0],enabled:true,strength:.5}],control:{enabled:true,kind:'pose',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',control_file:'control.mp4',fps:24,frame_count:124,width:864,height:480,strength:.8}};s.workflow=B.buildGraph(s,{},caps);console.log(JSON.stringify({s,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        validate_configuration(data['s'],data['caps'])
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'control.mp4').touch()
            with patch('h3_lab.control.video_metadata',return_value={'width':864,'height':480,'fps':24,'frame_count':124}):
                self.assertEqual(validate_control_graph(data['s'],root,data['caps'])['strength'],.8)

    def test_real_dial_graphs_match_backend_and_reject_drift(self):
        import copy, subprocess
        from h3_lab.configuration import validate_configuration
        script="""const C=require('./web/h3/configuration'),B=require('./web/h3/graph-builder');const caps={dials_ready:true,dial_files:['dials/h3_motion.safetensors'],refine_ready:true,turbo_ready:true,sampling_options:{samplers:['res_multistep','euler','h3_turbo'],schedulers:['simple'],weight_dtypes:['default']}};const specs=[];
for(const variant of ['native','pika','refine','spectrum','turbo']){
const name=Object.keys(C.PIKA)[0],p=C.pikaVariant(name),s={model_profile:'original',mode:'text',render_method:variant==='spectrum'?'spectrum':variant==='turbo'?'turbo':'native',steps:variant==='pika'?4:variant==='turbo'?6:20,dials:[{name:caps.dial_files[0],strength:.5,enabled:true}],enable_refine:['refine','spectrum'].includes(variant),loras:variant==='pika'?[{name,enabled:true,strength:1}]:variant==='refine'?[{name:'Motion_Repair_V2.safetensors',enabled:true,strength:.9}]:[],sampling:variant==='pika'?C.pikaSampling(p):{}};s.workflow=B.buildGraph(s,{},caps);specs.push(s);}console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],text=True))
        for spec in data['specs']:
            validate_configuration(spec,data['caps'])
            for mutation in ('strength','name','bypass','orphan'):
                bad=copy.deepcopy(spec)
                apply=next(n for n in bad['workflow'].values() if n.get('class_type')=='DialsApplyDial')
                load=bad['workflow'][apply['inputs']['dial'][0]]
                if mutation=='strength':apply['inputs']['strength']=2
                elif mutation=='name':load['inputs']['dial_name']='dials/other.safetensors'
                elif mutation=='orphan':bad['workflow']['999']={'class_type':'DialsLoadDial','inputs':{'dial_name':data['caps']['dial_files'][0]}}
                else:bad['workflow']['2']['inputs']['model']=apply['inputs']['model']
                with self.subTest(method=spec['render_method'],mutation=mutation),self.assertRaises(ValueError):validate_configuration(bad,data['caps'])

    def test_pins_and_no_extra_python_dependencies(self):
        from deploy.matlow import PACKS
        self.assertEqual(set(PACKS),{'mainodes','dials'})
        for item in PACKS.values():
            self.assertRegex(item['commit'],r'^[0-9a-f]{40}$')
            self.assertTrue(item['repository'].startswith('https://github.com/matlowai/'))

    def test_existing_custom_checkout_is_never_overwritten(self):
        from deploy.matlow import prepare_pack, PACKS
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);target=root/'custom_nodes'/PACKS['dials']['directory'];(target/'.git').mkdir(parents=True)
            with patch('deploy.matlow.git',side_effect=[PACKS['dials']['repository'],' M nodes.py']):
                with self.assertRaisesRegex(RuntimeError,'customized'):prepare_pack(root,'dials',Mock(),Mock())

    def test_copy_never_overwrites_a_custom_dial(self):
        from deploy.matlow import copy_dials
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source';source.mkdir();(source/'h3_motion.safetensors').write_bytes(b'verified')
            destination=root/'models'/'loras'/'dials';destination.mkdir(parents=True);(destination/'h3_motion.safetensors').write_bytes(b'user version')
            with self.assertRaisesRegex(RuntimeError,'preserved'):copy_dials(source,destination)
            self.assertEqual((destination/'h3_motion.safetensors').read_bytes(),b'user version')
