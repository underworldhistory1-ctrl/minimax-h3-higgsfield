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
