import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
from deploy import launcher_models
from deploy.update_source import update_source
from deploy.environment_audit import audit
from h3_lab.model_catalog import discover, reference_control_supported


class ModernizationTests(unittest.TestCase):
    def test_experimental_adapter_graphs_pass_actual_backend_configuration_admission(self):
        from h3_lab.configuration import validate_configuration
        script = """const C=require('./web/h3/configuration'),B=require('./web/h3/graph-builder');
const caps={model_catalog:[{name:'community.safetensors',profiles:['singularity']},{name:C.FL,profiles:['hybrid_conditioning','hybrid_loader']}],hybrid_loader_ready:true};
const specs=[];for(const model_profile of Object.keys(C.profiles))for(const render_method of ['native','motioncache','spectrum']){
const spec={mode:'refs',model_profile,checkpoint:'community.safetensors',render_method,loras:[{enabled:true,name:C.ANIME_TO_REALISM,strength:.8},{enabled:true,name:C.CHARACTER_SWAP,strength:.7},{enabled:true,name:'H3_Combat_V2.safetensors',strength:.6}],references:[{kind:'image',alias:'hero'},{kind:'video',alias:'shot',fps:24,frame_count:124,use_audio:true}],guides:[{kind:'image',file:'key.png',frame_idx:17}]};
spec.workflow=B.buildGraph(spec,{hero:'hero.png',shot:'shot.mp4'},caps);specs.push(spec);}console.log(JSON.stringify({specs,caps}));"""
        data = json.loads(subprocess.check_output(['node', '-e', script], cwd=Path(__file__).resolve().parents[1], text=True))
        self.assertEqual(len(data['specs']), 12)
        for spec in data['specs']:
            with self.subTest(profile=spec['model_profile'], method=spec['render_method']):
                validate_configuration(spec, data['caps'])

    def test_anime_realism_manifest_and_admission(self):
        import copy, json, subprocess
        from pathlib import Path
        from h3_lab.configuration import validate_anime_to_realism, ANIME_TO_REALISM
        artifact = next(a for a in launcher_models.manifest(qwen_profiles='', refine=False, controlnet=False) if a.relative_path.endswith(ANIME_TO_REALISM))
        self.assertEqual(artifact.size, 310168760)
        self.assertEqual(artifact.sha256, 'bce58949e0983115bb9b7f2cf79f7474119ce2cedd845e4c565666fabfde2a3e')
        self.assertIn('/33ee6502c125eea847aac14c49fecca43737ee40/', artifact.url)
        script="""const C=require('./web/h3/configuration');const spec={mode:'refs',loras:[{name:C.ANIME_TO_REALISM,enabled:true,strength:.8}],references:[{kind:'video',alias:'shot',fps:24,frame_count:124}]};spec.workflow=require('./web/h3/graph-builder').buildGraph(spec,{shot:'s.mp4'},{});console.log(JSON.stringify(spec));"""
        spec=json.loads(subprocess.check_output(['node','-e',script],cwd=Path(__file__).resolve().parents[1],text=True))
        validate_anime_to_realism(spec)
        for mutation in ('wrong_chain','missing_video','wrong_strength','undeclared','disconnected','duplicate'):
            bad=copy.deepcopy(spec)
            adapter=next(n for n in bad['workflow'].values() if n.get('class_type')=='LoraLoaderModelOnly')
            if mutation=='wrong_chain':
                bad['workflow']['other']={'class_type':'UNETLoader','inputs':{'unet_name':'other.safetensors'}};adapter['inputs']['model']=['other',0]
            elif mutation=='missing_video':bad['workflow']['6']['inputs'].pop('ref_videos.ref_video_0')
            elif mutation=='wrong_strength':adapter['inputs']['strength_model']=1
            elif mutation=='undeclared':bad['loras']=[]
            elif mutation=='duplicate':bad['loras'].append(copy.deepcopy(bad['loras'][0]))
            else:bad['workflow']['8']['inputs']['model']=['1',0]
            with self.assertRaises(ValueError):validate_anime_to_realism(bad)
        for profile in ('singularity','hybrid_loader','hybrid_conditioning'):
            candidate = copy.deepcopy(spec)
            candidate['model_profile'] = profile
            candidate['checkpoint'] = 'community.safetensors'
            candidate['workflow']['1'] = ({'class_type':'MinimaxH3_HybridLoader','inputs':{'base_model':'minimax_h3_fl2va_pruned_int8_convrot.safetensors','overlay_model':'','overlay_preset':'none'}} if profile == 'hybrid_loader' else {'class_type':'UNETLoader','inputs':{'unet_name': candidate['checkpoint'] if profile == 'singularity' else 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'}})
            validate_anime_to_realism(candidate)
        with self.assertRaisesRegex(ValueError,'source video'):validate_anime_to_realism({**spec,'references':[{'kind':'image'}]})

    def test_character_swap_manifest_and_admission(self):
        from h3_lab.configuration import validate_character_swap, CHARACTER_SWAP, REF
        item = next(x for x in launcher_models.manifest(qwen_profiles='', refine=False, controlnet=False) if x.relative_path.endswith(CHARACTER_SWAP))
        self.assertEqual(item.size, 155110320)
        self.assertEqual(item.sha256, '4b2a3f420ae804c0aa3422761ff84dbd1bf52eef6900ffab6d2e66df63cb4e79')
        self.assertIn('/a665bb7e3bb9804e487d2925f67744f554c8ad49/', item.url)
        script="""const C=require('./web/h3/configuration');const spec={mode:'refs',loras:[{name:C.CHARACTER_SWAP,enabled:true,strength:1}],references:[{kind:'video',alias:'shot',fps:24,frame_count:124},{kind:'image',alias:'replacement'}]};spec.workflow=require('./web/h3/graph-builder').buildGraph(spec,{shot:'s.mp4',replacement:'r.png'},{});console.log(JSON.stringify(spec));"""
        spec=json.loads(subprocess.check_output(['node','-e',script],cwd=Path(__file__).resolve().parents[1],text=True))
        validate_character_swap(spec)
        refinement_script = script.replace("mode:'refs'", "mode:'refs',enable_refine:true").replace('strength:1}', 'strength:1,refinement_strength:.25}').replace('},{});console', '},{refine_ready:true});console')
        refined=json.loads(subprocess.check_output(['node','-e',refinement_script],cwd=Path(__file__).resolve().parents[1],text=True))
        validate_character_swap(refined)
        for node in refined['workflow'].values():
            if node.get('class_type')=='LoraLoaderModelOnly':node['inputs']['strength_model']=.25 if node['inputs']['strength_model']==1 else 1
        with self.assertRaisesRegex(ValueError,'strength'):validate_character_swap(refined)
        for mutation in ('wrong_chain','missing_media','wrong_strength','alternate_loader'):
            bad=copy.deepcopy(spec)
            adapter=next(n for n in bad['workflow'].values() if n.get('class_type')=='LoraLoaderModelOnly')
            if mutation=='wrong_chain':
                bad['workflow']['other']={'class_type':'UNETLoader','inputs':{'unet_name':'singularity.safetensors'}}
                adapter['inputs']['model']=['other',0]
            elif mutation=='missing_media':bad['workflow']['6']['inputs'].pop('ref_videos.ref_video_0')
            elif mutation=='wrong_strength':adapter['inputs']['strength_model']=0
            else:adapter['class_type']='LoraLoader'
            with self.assertRaises(ValueError):validate_character_swap(bad)
        for profile in ('singularity','hybrid_loader','hybrid_conditioning'):
            candidate = copy.deepcopy(spec)
            candidate['model_profile'] = profile
            candidate['checkpoint'] = 'community.safetensors'
            candidate['workflow']['1'] = ({'class_type':'MinimaxH3_HybridLoader','inputs':{'base_model':'minimax_h3_fl2va_pruned_int8_convrot.safetensors','overlay_model':'','overlay_preset':'none'}} if profile == 'hybrid_loader' else {'class_type':'UNETLoader','inputs':{'unet_name': candidate['checkpoint'] if profile == 'singularity' else 'minimax_h3_fl2va_pruned_int8_convrot.safetensors'}})
            validate_character_swap(candidate)
        with self.assertRaisesRegex(ValueError,'replacement'):validate_character_swap({**spec,'references':[{'kind':'video'}]})
        with self.assertRaisesRegex(ValueError,'disagrees'):validate_character_swap({**spec,'loras':[]})
        with self.assertRaisesRegex(ValueError,'conditioning'):
            bad=copy.deepcopy(spec);bad['workflow']['1']['inputs']['unet_name']='other.safetensors';validate_character_swap(bad)

    def test_backend_rejects_ui_graph_configuration_drift(self):
        from h3_lab.configuration import validate_configuration, FL
        spec={'model_profile':'original','mode':'text','sampling':{'cfg':2},'workflow':{'1':{'class_type':'UNETLoader','inputs':{'unet_name':FL}},'6':{'class_type':'MiniMaxH3ImageToVideo','inputs':{}},'8':{'inputs':{'cfg':2}}}}
        validate_configuration(spec,{})
        spec['workflow']['8']['inputs']['cfg']=1
        with self.assertRaisesRegex(ValueError,'cfg'):
            validate_configuration(spec,{})
    def test_optional_checkpoint_is_pinned_and_never_mandatory(self):
        base = launcher_models.manifest(qwen_profiles='', refine=False, controlnet=False)
        optional = launcher_models.manifest(qwen_profiles='', refine=False, controlnet=False, checkpoint='singularity-int8')
        self.assertEqual(len(optional), len(base)+1)
        self.assertEqual(optional[-1].size, 20967647456)
        self.assertIn('/af671d9214a6e41ab8c2f43e9f871ea56246115f/', optional[-1].url)
        self.assertEqual(optional[-1].sha256, '412a7b126595a958964193f3b42513d7cf2df4196ef04223a0f05e3622949cce')
        with self.assertRaisesRegex(ValueError, 'retired'):
            launcher_models.manifest(turbo=True)

    def test_unapproved_source_update_never_merges(self):
        for policy in ('notify', 'verified'):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory);(root/'.git').mkdir()
                values=['https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git','main','','old','new']
                with patch('deploy.update_source.subprocess.check_output',side_effect=values), patch('deploy.update_source.subprocess.run',return_value=Mock(returncode=0)) as run:
                    self.assertFalse(update_source(root,policy))
                    self.assertFalse(any('merge' in call.args[0] for call in run.call_args_list))

    def test_empty_runtime_does_not_claim_optional_capabilities(self):
        caps=discover(None,{})
        self.assertFalse(caps['hybrid_loader_ready']);self.assertEqual(caps['model_catalog'],[])

    def test_environment_audit_reports_inconsistent_packages_without_repair(self):
        with patch('deploy.environment_audit.importlib.metadata.version',return_value='test'), patch('deploy.environment_audit.subprocess.run',return_value=Mock(returncode=1)) as run:
            result=audit()
        self.assertFalse(result['ready']);self.assertFalse(result['gpu_validated']);self.assertFalse(result['dependency_consistent'])
        self.assertIn('check',run.call_args.args[0]);self.assertNotIn('install',run.call_args.args[0])

    def test_references_control_graph_matches_real_frontend_builder(self):
        # Exercise the actual JS builder and Python admission together, using only media metadata fixtures.
        from h3_lab.control import validate_control_graph
        root=Path(__file__).resolve().parents[1]
        script="""const {buildGraph}=require('./web/h3/graph-builder');const spec={mode:'refs',width:1280,height:704,target_frames:124,control:{enabled:true,kind:'pose',model_name:'minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors',fps:24,frame_count:124,width:1280,height:704,control_file:'c.mp4',strength:1,start_percent:0,end_percent:1},references:[{kind:'image',alias:'hero'}]};spec.workflow=buildGraph(spec,{hero:'hero.png'},{controlnet_ready:true,controlnet_references_ready:true});console.log(JSON.stringify(spec));"""
        import shutil
        if not shutil.which('node'):self.skipTest('Node.js required for cross-language graph contract')
        spec=json.loads(subprocess.check_output(['node','-e',script],cwd=root,text=True))
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory)/'c.mp4').touch()
            with patch('h3_lab.control.video_metadata',return_value={'width':1280,'height':704,'fps':24.0,'frame_count':124}):
                self.assertEqual(validate_control_graph(spec,directory,{'controlnet_ready':True,'controlnet_references_ready':True})['strength'],1)
                with self.assertRaisesRegex(ValueError,'16020'):
                    validate_control_graph(spec,directory,{'controlnet_ready':True})
