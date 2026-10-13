import concurrent.futures
import json
import pathlib
import tempfile
import unittest
import zipfile
from h3_lab.assets import AssetService
from h3_lab.projects import ProjectService

class ProjectWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        self.assets=AssetService(str(self.root));self.projects=ProjectService(str(self.root),self.assets)
        self.project=self.projects.create_project('Film');self.pid=self.project['project_id']
    def tearDown(self):self.tmp.cleanup()
    def asset(self,n):
        file=self.root/f'{n}.png';file.write_bytes(f'unique fixture {n}'.encode())
        return self.assets.register_asset(str(file),'image',file.name,self.pid)
    def test_simultaneous_uploads_preserve_all_assets_and_unique_aliases(self):
        assets=[self.asset(n) for n in range(8)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda asset:self.projects.attach_asset(self.pid,asset,'characters','البطل'),assets))
        project=self.projects.get_project(self.pid)
        self.assertEqual(len(project['assets']),8);self.assertEqual(len({a['alias'] for a in project['assets']}),8)
        self.assertTrue(all(a['role']=='character identity' for a in project['assets']))
    def test_names_and_categories_preserve_alias_draft_history_and_conflicts(self):
        project=self.projects.attach_asset(self.pid,self.asset(1),'storyboards','Opening storyboard')
        item=project['assets'][0];project['takes']=[{'take_id':'old','draft':{'refs':[{'assetId':item['asset_id'],'alias':item['alias']}]}}]
        project['draft']={'refs':[{'assetId':item['asset_id'],'alias':item['alias']}],'prompts':{'refs':'@'+item['alias']}}
        project=self.projects.save_project(self.pid,project,project['revision'])
        history=json.dumps(project['takes']);draft=json.dumps(project['draft'])
        renamed=self.projects.update_workspace(self.pid,{'action':'edit_asset','asset_id':item['asset_id'],'name':'لوحة البداية','category':'props'},project['revision'])
        self.assertEqual(renamed['assets'][0]['alias'],item['alias']);self.assertEqual(json.dumps(renamed['takes']),history);self.assertEqual(json.dumps(renamed['draft']),draft)
        with self.assertRaises(ValueError) as error:self.projects.update_workspace(self.pid,{'action':'rename_project','name':'Wrong'},project['revision'])
        self.assertEqual(error.exception.status_code,409);self.assertEqual(self.projects.get_project(self.pid)['name'],'Film')
    def test_unused_catalog_assets_and_custom_categories_survive_bundle(self):
        project=self.projects.update_workspace(self.pid,{'action':'add_category','name':'Vehicles'},1)
        category=project['asset_categories'][-1]['id']
        project=self.projects.update_workspace(self.pid,{'action':'rename_category','category':category,'name':'Transport'},project['revision'])
        project=self.projects.attach_asset(self.pid,self.asset(1),category,'Car')
        project['draft']={'refs':[]};self.projects.save_project(self.pid,project,project['revision'])
        bundle=self.projects.export_bundle(self.pid,include_takes=False)
        with zipfile.ZipFile(bundle) as archive:self.assertTrue(any(n.startswith('assets/') for n in archive.namelist()))
        imported=self.projects.import_bundle(str(bundle));self.assertEqual(len(imported['assets']),1)
        self.assertEqual(imported['assets'][0]['name'],'Car');self.assertEqual(imported['asset_categories'][-1]['name'],'Transport')
    def test_legacy_migration_keeps_ids_and_native_storyboard_role(self):
        asset=self.asset(1);legacy=dict(self.project);legacy.pop('asset_categories');legacy['assets']=[{'asset_id':asset['asset_id'],'alias':'board'}]
        legacy['draft']={'refs':[{'assetId':asset['asset_id'],'alias':'board','kind':'image','role':'storyboard'}]}
        self.projects._write_manifest(self.pid,legacy)
        migrated=self.projects.get_project(self.pid)
        self.assertEqual(migrated['revision'],1);self.assertEqual(migrated['assets'][0]['category'],'storyboards')
        self.assertEqual(migrated['assets'][0]['asset_id'],asset['asset_id']);self.assertEqual(migrated['assets'][0]['alias'],'board')

    def test_image_in_audio_category_keeps_compatible_picture_role(self):
        project=self.projects.attach_asset(self.pid,self.asset(1),'audio','Artwork')
        self.assertEqual(project['assets'][0]['role'],'custom')
        project=self.projects.update_workspace(self.pid,{'action':'edit_asset','asset_id':project['assets'][0]['asset_id'],'category':'audio'},project['revision'])
        self.assertEqual(project['assets'][0]['role'],'custom')

    def test_server_owned_completed_take_recovers_snapshot_once(self):
        from unittest.mock import patch
        self.projects.output_root=self.root
        job={'project_id':self.pid,'state':'completed','request_id':'123abc456def','take_id':'123abc456def',
             'output':{'filename':'h3_studio_123abc456def_00001_.mp4','subfolder':'video'},
             'render_spec':{'project_snapshot':{'settings':{'frames':124},'draft':{'prompts':{'text':'Original prompt'}}}}}
        with patch('h3_lab.projects.owned_video',return_value=self.root/'video.mp4') as probe:
            self.projects.attach_completed_job(job);self.projects.attach_completed_job(job)
            self.assertEqual(probe.call_count,1)
        project=self.projects.get_project(self.pid)
        self.assertEqual(len(project['takes']),1);self.assertEqual(project['takes'][0]['draft']['prompts']['text'],'Original prompt')
        self.assertEqual(project['takes'][0]['unique_frames'],124)

    def test_malformed_optional_snapshot_does_not_break_recovery(self):
        from unittest.mock import patch
        self.projects.output_root=self.root
        job={'project_id':self.pid,'state':'completed','request_id':'123abc456def','take_id':'123abc456def',
             'output':{'filename':'h3_studio_123abc456def_00001_.mp4','subfolder':'video'},
             'render_spec':{'project_snapshot':['legacy invalid']}}
        with patch('h3_lab.projects.owned_video',return_value=self.root/'video.mp4'):
            self.projects.attach_completed_job(job)
        self.assertEqual(len(self.projects.get_project(self.pid)['takes']),1)
        job['take_id']='789abc456def';job['render_spec']={'project_snapshot':{'settings':['invalid']}}
        with patch('h3_lab.projects.owned_video',return_value=self.root/'video.mp4'):
            self.projects.attach_completed_job(job)
        self.assertEqual(len(self.projects.get_project(self.pid)['takes']),2)
        job['take_id']=['invalid']
        with self.assertRaises(ValueError):self.projects.attach_completed_job(job)
