import copy
import json
import pathlib
import tempfile
import unittest
import uuid
import subprocess
from unittest.mock import patch
from h3_lab.assets import AssetService
from h3_lab.projects import ProjectService


class OrganizationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.assets=AssetService(str(self.root));self.service=ProjectService(str(self.root),self.assets,output_root=self.root)
        self.source=self.service.create_project('Source');self.target=self.service.create_project('Destination')
        file=self.root/'hero.png';file.write_bytes(b'fixture image');self.asset=self.assets.register_asset(str(file),'image','hero.png',self.source['project_id'])
        self.source=self.service.attach_asset(self.source['project_id'],self.asset,'characters','Hero')
    def tearDown(self):self.tmp.cleanup()
    def body(self,**updates):
        return {'request_id':str(uuid.uuid4()),'target_project_id':self.target['project_id'],'source_revision':self.source['revision'],
            'target_revision':self.target['revision'],'asset_ids':[self.asset['asset_id']],'take_ids':[],'mode':'copy',**updates}
    def take(self):
        (self.root/'video').mkdir(exist_ok=True);path=self.root/'video/h3_studio_123abc456def_00001_.mp4'
        from h3_lab.assembly import get_ffmpeg_path
        subprocess.run([get_ffmpeg_path(),'-v','error','-f','lavfi','-i','color=size=64x64:rate=24','-frames:v','5','-c:v','libx264',str(path)],check=True)
        draft={'mode':'refs','settings':{'seed':'18446744073709551615','duration':73,'durationSeconds':73/24,'steps':20},
            'prompts':{'refs':'Film @hero'},'refs':[{'assetId':self.asset['asset_id'],'alias':'hero','kind':'image','role':'character identity'}],
            'guides':[],'configuration':{'sampling':{'shift_video':12}},'controlInputs':{},'loras':[{'name':'adapter','strength':.7,'enabled':True}]}
        take={'take_id':'123abc456def','output_file':path.relative_to(self.root).as_posix(),'draft':draft,'effective_settings':{'seed':'18446744073709551615'}}
        self.source['takes']=[take];self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision']);return take
    def test_folder_assignment_survives_rename_and_restart_without_moving_ids(self):
        org=self.service.organize({'action':'create_folder','name':'Feature film'},1);folder=org['folders'][0]
        updated=self.service.update_workspace(self.source['project_id'],{'action':'file_project','folder_id':folder['id']},self.source['revision'])
        self.service.organize({'action':'rename_folder','folder_id':folder['id'],'name':'New film'},org['revision'])
        restarted=ProjectService(str(self.root),self.assets,output_root=self.root)
        self.assertEqual(restarted.get_project(updated['project_id'])['folder_id'],folder['id']);self.assertEqual(restarted.organization()['folders'][0]['name'],'New film')
        self.assertTrue((self.root/'projects'/updated['project_id']/'project.json').is_file())
    def test_invalid_and_stale_folder_operations_do_not_change_projects(self):
        with self.assertRaises(ValueError):self.service.organize({'action':'create_folder','name':' '},1)
        self.service.organize({'action':'create_folder','name':'Film'},1)
        with self.assertRaises(ValueError) as error:self.service.organize({'action':'create_folder','name':'Other'},1)
        self.assertEqual(error.exception.status_code,409)
        with self.assertRaises(ValueError):self.service.update_workspace(self.source['project_id'],{'action':'file_project','folder_id':'missing'},self.source['revision'])
    def test_asset_folders_are_independent_of_roles_and_preserve_aliases(self):
        project=self.service.update_workspace(self.source['project_id'],{'action':'add_asset_folder','name':'Scene 1'},self.source['revision'])
        folder=project['asset_folders'][0]['id'];project=self.service.update_workspace(project['project_id'],{'action':'file_assets','asset_ids':[self.asset['asset_id']],'folder_id':folder},project['revision'])
        self.assertEqual(project['assets'][0]['role'],'character identity');self.assertEqual(project['assets'][0]['alias'],'Hero')
        with self.assertRaises(ValueError):self.service.update_workspace(project['project_id'],{'action':'file_assets','asset_ids':['bad'],'folder_id':folder},project['revision'])
    def test_copy_is_idempotent_and_adds_ownership_without_mutating_source(self):
        before=copy.deepcopy(self.source);body=self.body();first=self.service.transfer(self.source['project_id'],body);again=self.service.transfer(self.source['project_id'],body)
        self.assertEqual(first['target']['revision'],again['target']['revision']);self.assertEqual(self.service.get_project(self.source['project_id']),before)
        self.assertIn(self.target['project_id'],self.assets.get_asset(self.asset['asset_id'])['projects'])
        with self.assertRaises(ValueError):self.service.transfer(self.source['project_id'],{**body,'mode':'move'})
    def test_stale_destination_cannot_partially_copy(self):
        body=self.body(target_revision=99)
        with self.assertRaises(ValueError):self.service.transfer(self.source['project_id'],body)
        self.assertEqual(self.service.get_project(self.target['project_id'])['assets'],[])
    def test_unused_assets_move_and_used_assets_require_copy(self):
        take=self.take()
        with self.assertRaisesRegex(ValueError,'used by saved shots'):self.service.transfer(self.source['project_id'],self.body(mode='move'))
        self.source['takes']=[];self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        result=self.service.transfer(self.source['project_id'],self.body(mode='move'))
        self.assertEqual(result['source']['assets'],[]);self.assertEqual(len(result['target']['assets']),1);self.assertIsNotNone(self.assets.get_asset(self.asset['asset_id']))
    def test_take_copy_carries_references_and_move_tombstone_prevents_recovery_duplicate(self):
        take=self.take();result=self.service.transfer(self.source['project_id'],self.body(asset_ids=[],take_ids=[take['take_id']],mode='move'))
        self.assertEqual(result['source']['takes'],[]);self.assertEqual(result['target']['takes'][0]['draft'],take['draft']);self.assertEqual(len(result['target']['assets']),1)
        self.service.attach_completed_job({'state':'completed','project_id':self.source['project_id'],'take_id':take['take_id'],'output':{'filename':'h3_studio_123abc456def_00001_.mp4','subfolder':'video'}})
        self.assertEqual(self.service.get_project(self.source['project_id'])['takes'],[])
    def test_accepted_sequence_take_move_is_refused(self):
        take=self.take();self.source['accepted_take_ids']=[take['take_id']];self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        with self.assertRaisesRegex(ValueError,'Accepted'):self.service.transfer(self.source['project_id'],self.body(asset_ids=[],take_ids=[take['take_id']],mode='move'))
    def test_interrupted_multi_project_write_recovers_on_restart(self):
        original=self.service._write_manifest;calls=[]
        def interrupted(pid,value):
            calls.append(pid)
            if len(calls)==2:raise OSError('simulated power loss')
            return original(pid,value)
        with patch.object(self.service,'_write_manifest',side_effect=interrupted):
            with self.assertRaises(OSError):self.service.transfer(self.source['project_id'],self.body(mode='move'))
        restarted=ProjectService(str(self.root),self.assets,output_root=self.root)
        self.assertEqual(restarted.get_project(self.source['project_id'])['assets'],[]);self.assertEqual(len(restarted.get_project(self.target['project_id'])['assets']),1)
    def test_full_reuse_preserves_exact_settings_aliases_and_original_take(self):
        take=self.take();before=copy.deepcopy(self.service.get_project(self.source['project_id']))
        prepared=self.service.prepare_reuse(take['output_file']);self.assertTrue(prepared['complete']);self.assertEqual(prepared['draft'],take['draft'])
        result=self.service.apply_reuse(take['output_file'],self.target['project_id'],1)
        self.assertEqual(result['project']['draft']['settings']['seed'],'18446744073709551615');self.assertEqual(result['project']['draft']['refs'][0]['alias'],'hero')
        self.assertEqual(self.service.get_project(self.source['project_id']),before)
    def test_missing_reference_is_reported_and_not_fabricated(self):
        take=self.take();(self.root/self.asset['server_path']).unlink()
        prepared=self.service.prepare_reuse(take['output_file']);self.assertFalse(prepared['complete']);self.assertIn(self.asset['asset_id'],prepared['missing'])
    def test_unrecorded_video_and_traversal_cannot_claim_full_reuse(self):
        take=self.take();self.source['takes']=[];self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        self.assertFalse(self.service.prepare_reuse(take['output_file'])['available'])
        with self.assertRaises((ValueError,FileNotFoundError)):self.service.prepare_reuse('../video/h3_studio_123abc456def_00001_.mp4')

    def test_legacy_clip_reference_prevents_destructive_move(self):
        self.source['clips']=[{'clip_id':'legacy','refs':[{'assetId':self.asset['asset_id']}]}]
        self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        with self.assertRaisesRegex(ValueError,'used by saved shots'):
            self.service.transfer(self.source['project_id'],self.body(mode='move'))
        self.assertEqual(len(self.service.get_project(self.source['project_id'])['assets']),1)

    def test_missing_generated_context_is_durable_reuse_requirement(self):
        take=self.take();self.source['takes'][0]['draft']['continuation']={'type':'generated','source_token':'abcdef123456'}
        self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        prepared=self.service.prepare_reuse(take['output_file'])
        self.assertFalse(prepared['complete']);self.assertIn('Generated continuation context',prepared['missing'])
        applied=self.service.apply_reuse(take['output_file'],self.target['project_id'],1)
        self.assertIn('Generated continuation context',applied['project']['draft']['reuse_missing'])

    def test_legacy_timing_guides_are_not_reported_as_full_reuse(self):
        take=self.take();self.source['takes']=[]
        self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        metadata={'h3_studio_123abc456def_00001_.mp4':{'settings':{'prompt':'A shot','timingConfiguration':{'guides':[{'frame':0}]}}}}
        (self.root/'video/.h3-studio-metadata.json').write_text(json.dumps(metadata))
        prepared=self.service.prepare_reuse(take['output_file'])
        self.assertFalse(prepared['complete']);self.assertIn('Unrecorded advanced inputs',prepared['missing'])

    def test_legacy_audio_enhancement_settings_survive_reuse(self):
        take=self.take();self.source['takes']=[]
        self.source=self.service.save_project(self.source['project_id'],self.source,self.source['revision'])
        audio={'enabled':True,'steps':7,'denoise':.4,'sampler_name':'euler','scheduler':'simple'}
        metadata={'h3_studio_123abc456def_00001_.mp4':{'settings':{'prompt':'A shot','timingConfiguration':{'audio_refinement':audio,'preserve_reference_audio':True}}}}
        (self.root/'video/.h3-studio-metadata.json').write_text(json.dumps(metadata))
        prepared=self.service.prepare_reuse(take['output_file'])
        self.assertEqual(prepared['draft']['configuration']['audioRefinement'],audio)
        self.assertTrue(prepared['draft']['configuration']['preserveReferenceAudio'])
