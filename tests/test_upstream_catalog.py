import json
import subprocess
import unittest
from pathlib import Path
from deploy import launcher_models
from deploy.launcher import parser
from h3_lab.configuration import PIKA, validate_character_swap, validate_configuration
from h3_lab.model_catalog import SINGULARITY

ROOT = Path(__file__).resolve().parents[1]

class UpstreamCatalogTests(unittest.TestCase):
    def test_new_weights_are_pinned_and_legacy_swap_remains(self):
        items = {Path(x.relative_path).name:x for x in launcher_models.manifest(qwen_profiles='',refine=False,controlnet=False)}
        for name in ['pika_h3_flex_turbo_2step_draft_ref2va.safetensors','pika_h3_flex_turbo_4step_fl2va_lite_r32.safetensors','pika_h3_flex_turbo_4step_ref2va_lite_r32.safetensors','h3_character_swap_v1.5.safetensors']:
            self.assertIn(name,items);self.assertEqual(len(items[name].sha256),64);self.assertNotIn('/resolve/main/',items[name].url)
        self.assertIn('h3_character_swap_pro4500_1000.safetensors',items)
        self.assertEqual(PIKA['pika_h3_flex_turbo_2step_draft_ref2va.safetensors'],(2,'ref2va'))
    def test_singularity_v2_is_explicit_and_legacy_option_remains(self):
        base=launcher_models.manifest(qwen_profiles='',refine=False,controlnet=False)
        new=launcher_models.manifest(qwen_profiles='',refine=False,controlnet=False,checkpoint='singularity-v2-int8')
        self.assertEqual(len(new),len(base)+1)
        self.assertEqual(new[-1].size,20967647456)
        self.assertEqual(new[-1].sha256,'d7637c2c35cd30facd9e93778c491f6d82f91c4a441aecbdb4c384a62a5f3d9f')
        self.assertIn(Path(new[-1].relative_path).name,SINGULARITY)
        self.assertEqual(parser().parse_args(['--checkpoint','singularity-v2-int8']).checkpoint,'singularity-v2-int8')
        wrapper=(ROOT/'install.ps1').read_text(encoding='utf-8')
        self.assertIn('[ValidateSet("singularity-int8", "singularity-v2-int8")][string]$Checkpoint',wrapper)
        self.assertIn('$arguments += @("--checkpoint", $Checkpoint)',wrapper)
        self.assertTrue(launcher_models.manifest(qwen_profiles='',refine=False,controlnet=False,checkpoint='singularity-int8'))
    def test_swap_v15_graph_is_validated_including_hidden_missing_selection(self):
        script="""const C=require('./web/h3/configuration');const s={model_profile:'original',mode:'refs',loras:[{name:'h3_character_swap_v1.5.safetensors',enabled:true,strength:1}],references:[{kind:'image',alias:'hero'},{kind:'video',alias:'source',fps:24,frame_count:72,duration:3}]};s.workflow=require('./web/h3/graph-builder').buildGraph(s,{hero:'hero.png',source:'source.mp4'},{});console.log(JSON.stringify(s));"""
        spec=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True));validate_character_swap(spec)
        mixed=json.loads(json.dumps(spec));mixed['workflow']['legacy']={'class_type':'LoraLoaderModelOnly','inputs':{'lora_name':'h3_character_swap_pro4500_1000.safetensors'}}
        with self.assertRaisesRegex(ValueError,'one Character Swap version'):validate_character_swap(mixed)
        spec['loras']=[]
        with self.assertRaisesRegex(ValueError,'disagrees'):validate_character_swap(spec)
    def test_pika_singularity_v2_reference_graph_and_checkpoint_drift(self):
        import copy
        script="""const C=require('./web/h3/configuration'),B=require('./web/h3/graph-builder');const checkpoint='Minimax-h3_Singularity_ref2va_v2_pruned_int8.safetensors';const caps={model_catalog:[{name:checkpoint,profiles:['singularity']}],sampling_options:{samplers:['euler'],schedulers:['simple'],weight_dtypes:['default']}};const specs=Object.entries(C.PIKA).filter(([n,p])=>p.family==='ref2va').map(([name,p])=>{const s=C.normalizeSelection({mode:'refs',model_profile:'singularity',checkpoint,loras:[{name,enabled:true,strength:1}],references:[{kind:'image',alias:'hero'}]},'pika',caps);s.workflow=B.buildGraph(s,{hero:'hero.png'},caps);return s;});console.log(JSON.stringify({specs,caps}));"""
        data=json.loads(subprocess.check_output(['node','-e',script],cwd=ROOT,text=True))
        self.assertEqual(len(data['specs']),4)
        for spec in data['specs']:
            validate_configuration(spec,data['caps'])
            bad=copy.deepcopy(spec);bad['workflow']['1']['inputs']['unet_name']='other.safetensors'
            with self.assertRaises(ValueError):validate_configuration(bad,data['caps'])
