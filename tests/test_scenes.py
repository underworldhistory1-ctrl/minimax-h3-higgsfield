import tempfile
import unittest
from h3_lab.projects import ProjectService

class SceneTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.s = ProjectService(self.tmp.name)
        self.p = self.s.create_project('Film')
    def tearDown(self): self.tmp.cleanup()
    def op(self, action, **kw):
        self.p = self.s.update_workspace(self.p['project_id'], dict(action=action, **kw), self.p['revision'])
        return self.p
    def test_empty_legacy_and_crud(self):
        self.assertEqual(self.p['scenes'], [])
        self.p['draft'] = {'prompts': {'text':'legacy'}}
        self.p = self.s.save_project(self.p['project_id'], self.p, 1)
        self.op('create_scene', name='First'); sid=self.p['scenes'][0]['scene_id']
        self.op('adopt_legacy_shot', scene_id=sid, name='Opening')
        shot=self.p['scenes'][0]['shots'][0]
        self.assertEqual(shot['draft'], self.p['draft'])
        self.op('duplicate_shot', scene_id=sid, shot_id=shot['shot_id'], name='Copy')
        ids=[s['shot_id'] for s in self.p['scenes'][0]['shots']]
        self.assertEqual(len(set(ids)),2)
        self.op('reorder_shots', scene_id=sid, shot_ids=ids[::-1])
        self.assertEqual(self.p['scenes'][0]['shots'][0]['shot_id'],ids[1])
        with self.assertRaises(ValueError): self.op('reorder_shots', scene_id=sid, shot_ids=[ids[0],ids[0]])
        self.op('delete_shot', scene_id=sid, shot_id=ids[1])
        self.op('rename_scene', scene_id=sid, name='Renamed')
        self.op('duplicate_scene', scene_id=sid, name='Scene copy')
        self.assertNotEqual(self.p['scenes'][1]['shots'][0]['shot_id'],ids[0])
        self.assertEqual(self.p['draft']['prompts']['text'],'legacy')
    def test_revision_schema_and_protected_delete(self):
        self.op('create_scene', name='Scene'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot', scene_id=sid, name='Shot'); shot=self.p['scenes'][0]['shots'][0]
        with self.assertRaises(ValueError): self.s.update_workspace(self.p['project_id'],{'action':'delete_scene','scene_id':sid},1)
        self.p['takes']=[{'take_id':'take','scene_id':sid,'shot_id':shot['shot_id'],'clip_id':shot['shot_id']}]
        self.p=self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
        with self.assertRaises(ValueError): self.op('delete_scene',scene_id=sid)
        self.p['scenes'][0]['shots'].append(dict(shot))
        with self.assertRaises(ValueError): self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
    def test_foreign_shot_and_jobs_block(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='A'); shot=self.p['scenes'][0]['shots'][0]
        class Jobs:
            def project_jobs(inner,pid): return [{'state':'running','render_spec':{'project_snapshot':{'scene_id':sid,'shot_id':shot['shot_id']}}}]
        with self.assertRaises(ValueError): self.s.update_workspace(self.p['project_id'],{'action':'delete_scene','scene_id':sid},self.p['revision'],Jobs())
        with self.assertRaises(ValueError): self.op('rename_shot',scene_id=sid,shot_id='foreign',name='Bad')

    def test_old_client_preserves_scenes_and_snapshot_ownership(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='A'); sh=self.p['scenes'][0]['shots'][0]
        old=dict(self.p); old.pop('scenes')
        self.p=self.s.save_project(self.p['project_id'],old,self.p['revision'])
        self.assertEqual(self.p['scenes'][0]['scene_id'],sid)
        with self.assertRaises(ValueError): self.s.validate_snapshot(self.p,{'scene_id':sid,'shot_id':sh['shot_id'],'clip_id':'other'})
        self.s.validate_snapshot(self.p,{'scene_id':sid,'shot_id':sh['shot_id'],'clip_id':sh['shot_id']})
    def test_reuse_targets_only_shot_and_validates_membership(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='A'); sh=self.p['scenes'][0]['shots'][0]
        self.p['draft']={'legacy':True}
        self.p=self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
        self.s.prepare_reuse=lambda *a: {'available':True,'assets':[],'draft':{'prompts':{'text':'reused'}},'missing':[],'warnings':[],'complete':True,'source_take_id':None,'source_project_id':None}
        with self.assertRaises(ValueError): self.s.apply_reuse('video/a.mp4',self.p['project_id'],self.p['revision'],target_scene_id=sid,target_shot_id='foreign')
        result=self.s.apply_reuse('video/a.mp4',self.p['project_id'],self.p['revision'],target_scene_id=sid,target_shot_id=sh['shot_id'])['project']
        self.assertEqual(result['draft'],{'legacy':True})
        self.assertEqual(result['scenes'][0]['shots'][0]['draft']['prompts']['text'],'reused')
    def test_nested_bundle_round_trip(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='A')
        self.p['scenes'][0]['shots'][0]['draft']={'prompts':{'text':'unique'}}
        self.p=self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
        imported=self.s.import_bundle(str(self.s.export_bundle(self.p['project_id'])))
        self.assertEqual(imported['scenes'],self.p['scenes'])

    def test_completion_uses_immutable_snapshot_after_selection_changes(self):
        from pathlib import Path
        self.s.output_root=Path(self.tmp.name)
        video=self.s.output_root/'video'/'done.mp4'; video.parent.mkdir(); video.write_bytes(b'video fixture')
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='First'); first=self.p['scenes'][0]['shots'][0]['shot_id']
        self.op('create_shot',scene_id=sid,name='Second')
        snapshot={'scene_id':sid,'shot_id':first,'clip_id':first,'draft':{'prompts':{'text':'submitted'}}}
        job={'state':'completed','project_id':self.p['project_id'],'take_id':'take1','output':{'filename':'done.mp4','subfolder':'video'},'render_spec':{'project_snapshot':snapshot}}
        from unittest.mock import patch
        with patch('h3_lab.projects.owned_video',return_value=video):
            result=self.s.attach_completed_job(job)
        take=result['takes'][0]
        self.assertEqual((take['scene_id'],take['shot_id'],take['clip_id']),(sid,first,first))
        changed=dict(result); changed['takes']=[dict(take,shot_id=result['scenes'][0]['shots'][1]['shot_id'])]
        with self.assertRaises(ValueError): self.s.save_project(result['project_id'],changed,result['revision'])
    def test_other_shot_dependency_protects_deletion(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='First'); first=self.p['scenes'][0]['shots'][0]['shot_id']
        self.op('create_shot',scene_id=sid,name='Second')
        self.p['scenes'][0]['shots'][1]['draft']={'continuation':{'source_shot_id':first}}
        self.p=self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
        with self.assertRaises(ValueError): self.op('delete_shot',scene_id=sid,shot_id=first)

    def test_shot_cannot_move_scenes_even_without_takes(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='First')
        self.op('create_scene',name='B')
        self.p['scenes'][1]['shots'].append(self.p['scenes'][0]['shots'].pop())
        with self.assertRaises(ValueError): self.s.save_project(self.p['project_id'],self.p,self.p['revision'])
    def test_job_admission_persists_inside_project_lock(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        self.op('create_shot',scene_id=sid,name='First'); shot=self.p['scenes'][0]['shots'][0]['shot_id']
        service=self.s
        class Jobs:
            def submit_job(inner,*args):
                self.assertTrue(service._lock._is_owned())
                return {'job_id':'job'},False
        spec={'project_snapshot':{'scene_id':sid,'shot_id':shot,'clip_id':shot}}
        result=self.s.submit_owned_job(Jobs(),'request',spec,[],self.p['project_id'],'take')
        self.assertEqual(result[0]['job_id'],'job')
        spec['project_snapshot']['scene_id']='foreign'
        with self.assertRaises(ValueError): self.s.submit_owned_job(Jobs(),'request',spec,[],self.p['project_id'],'take')

    def test_unknown_job_ownership_blocks_delete(self):
        self.op('create_scene',name='A'); sid=self.p['scenes'][0]['scene_id']
        class Jobs:
            def project_jobs(inner,pid): return [{'state':'unknown','render_spec':{}}]
        with self.assertRaises(ValueError): self.s.update_workspace(self.p['project_id'],{'action':'delete_scene','scene_id':sid},self.p['revision'],Jobs())
