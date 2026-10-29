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
        history=json.dumps(project['takes'])
        renamed=self.projects.update_workspace(self.pid,{'action':'edit_asset','asset_id':item['asset_id'],'name':'لوحة البداية','category':'props'},project['revision'])
        self.assertEqual(renamed['assets'][0]['alias'],item['alias'])
        self.assertEqual(renamed['draft']['refs'][0]['alias'],item['alias'])
        self.assertEqual(renamed['draft']['prompts']['refs'],'@'+item['alias'])
        self.assertEqual(json.dumps(renamed['takes']),history)
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

    def test_legacy_completed_job_recovers_frame_count_without_default(self):
        from unittest.mock import patch
        self.projects.output_root=self.root
        job={'state':'completed','project_id':self.pid,'take_id':'legacy','output':{'filename':'h3_studio_123abc456def_00001_.mp4','subfolder':'video'},'render_spec':{'target_frames':362,'frames':{'first':'input.png'}}}
        with patch('h3_lab.projects.owned_video',return_value=self.root/'video.mp4'):
            self.projects.attach_completed_job(job)
        self.assertEqual(self.projects.get_project(self.pid)['takes'][0]['unique_frames'],362)

    def test_display_rename_keeps_canonical_alias_and_draft_bindings(self):
        project=self.projects.attach_asset(self.pid,self.asset(1),'characters','uploaded-file.png')
        original=project['assets'][0].copy()
        project['draft']={'refs':[{'assetId':original['asset_id'],'alias':original['alias']}],'prompts':{'refs':'@'+original['alias']}}
        project=self.projects.save_project(self.pid,project,project['revision'])
        renamed=self.projects.update_workspace(self.pid,{'action':'edit_asset','asset_id':original['asset_id'],'name':'Named Hero'},project['revision'])
        self.assertEqual(renamed['assets'][0]['name'],'Named Hero')
        self.assertEqual(renamed['assets'][0]['alias'],original['alias'])
        self.assertEqual(renamed['draft'],project['draft'])


    def test_replace_element_rebases_editable_drafts_but_preserves_takes(self):
        old, new = self.asset(41), self.asset(42)
        project = self.projects.attach_asset(self.pid,old,'characters','Hero')
        original = project['assets'][0].copy()
        draft = {'refs':[{'assetId':old['asset_id'],'alias':'shot_hero','role':'custom','trimStart':2}], 'prompts':{'refs':'@shot_hero'}}
        project['draft'] = json.loads(json.dumps(draft))
        project['scenes'] = []
        project['takes'] = [{'take_id':'past','draft':json.loads(json.dumps(draft))}]
        project = self.projects.save_project(self.pid,project,project['revision'])
        changed = self.projects.update_workspace(self.pid,{'action':'replace_asset','asset_id':old['asset_id'],'replacement_id':new['asset_id']},project['revision'])
        self.assertEqual(len(changed['assets']),1)
        self.assertEqual(changed['assets'][0]['asset_id'],new['asset_id'])
        self.assertEqual(changed['assets'][0]['alias'],original['alias'])
        self.assertEqual(changed['draft']['refs'][0]['assetId'],new['asset_id'])
        self.assertEqual(changed['draft']['refs'][0]['alias'],'shot_hero')
        self.assertEqual(changed['draft']['prompts'],draft['prompts'])
        self.assertEqual(changed['takes'][0]['draft'],draft)
        self.assertIsNotNone(self.assets.get_asset(old['asset_id']))

    def test_replacement_cannot_merge_two_existing_elements_or_use_stale_revision(self):
        a,b = self.asset(51), self.asset(52)
        project = self.projects.attach_asset(self.pid,a,'characters','First')
        revision = project['revision']
        project = self.projects.attach_asset(self.pid,b,'characters','Second')
        op={'action':'replace_asset','asset_id':a['asset_id'],'replacement_id':b['asset_id']}
        with self.assertRaises(ValueError):self.projects.update_workspace(self.pid,op,project['revision'])
        with self.assertRaises(ValueError) as error:self.projects.update_workspace(self.pid,op,revision)
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(len(self.projects.get_project(self.pid)['assets']),2)

    def test_modern_catalog_does_not_stat_every_original_for_each_project_read(self):
        from unittest.mock import patch
        self.projects.attach_asset(self.pid,self.asset(61),'characters','Hero')
        with patch.object(self.assets,'get_asset',side_effect=AssertionError('Redundant filesystem lookup')):
            project=self.projects.get_project(self.pid)
        self.assertEqual(project['assets'][0]['name'],'Hero')


    def test_replacement_archive_survives_portable_export_and_import(self):
        a,b=self.asset(71),self.asset(72)
        project=self.projects.attach_asset(self.pid,a,'characters','Original Hero')
        project['takes']=[{'take_id':'past','draft':{'refs':[{'assetId':a['asset_id'],'alias':'hero'}]}}]
        project=self.projects.save_project(self.pid,project,project['revision'])
        project=self.projects.update_workspace(self.pid,{'action':'replace_asset','asset_id':a['asset_id'],'replacement_id':b['asset_id']},project['revision'])
        bundle=self.projects.export_bundle(self.pid)
        imported=self.projects.import_bundle(str(bundle))
        self.assertEqual(len(imported['assets']),1)
        self.assertEqual(len(imported['archived_assets']),1)
        self.assertEqual(imported['takes'][0]['draft']['refs'][0]['assetId'],imported['archived_assets'][0]['asset_id'])
        self.assertEqual(imported['assets'][0]['name'],'Original Hero')

    def test_replacing_with_original_prunes_cycle_and_preserves_one_archive_record(self):
        a,b=self.asset(81),self.asset(82)
        project=self.projects.attach_asset(self.pid,a,'characters','Hero')
        for old,new in [(a,b),(b,a),(a,b)]:
            project=self.projects.update_workspace(self.pid,{'action':'replace_asset','asset_id':old['asset_id'],'replacement_id':new['asset_id']},project['revision'])
            self.assertNotIn(new['asset_id'],project['asset_replacements'])
            self.assertEqual(project['asset_replacements'][old['asset_id']],new['asset_id'])
            self.assertEqual(len(project['archived_assets']),1)

    def test_legacy_duplicate_aliases_are_disambiguated_without_rewriting_shot(self):
        a,b=self.asset(91),self.asset(92)
        project=self.projects.attach_asset(self.pid,a,'characters','Hero')
        project=self.projects.attach_asset(self.pid,b,'characters','Other')
        project['assets'][1]['alias']='HERO'
        project['draft']={'refs':[{'assetId':b['asset_id'],'alias':'HERO'}]}
        self.projects._write_manifest(self.pid,project)
        loaded=self.projects.get_project(self.pid)
        self.assertEqual(len({a['alias'].casefold() for a in loaded['assets']}),2)
        self.assertEqual(loaded['draft']['refs'][0]['alias'],'HERO')


    def test_reupload_original_is_independent_and_bundle_has_unique_payloads(self):
        a,b=self.asset(101),self.asset(102)
        project=self.projects.attach_asset(self.pid,a,'characters','Hero')
        project=self.projects.update_workspace(self.pid,{'action':'replace_asset','asset_id':a['asset_id'],'replacement_id':b['asset_id']},project['revision'])
        project=self.projects.attach_asset(self.pid,a,'characters','Earlier costume')
        self.assertEqual(len(project['assets']),2)
        with zipfile.ZipFile(self.projects.export_bundle(self.pid)) as archive:
            media=[name for name in archive.namelist() if name.startswith('assets/')]
            self.assertEqual(len(media),len(set(media)))

    def test_replacement_preserves_another_project_using_the_same_image(self):
        a,b=self.asset(111),self.asset(112)
        project=self.projects.attach_asset(self.pid,a,'characters','Hero')
        other=self.projects.create_project('Other film')
        self.projects.attach_asset(other['project_id'],a,'characters','Other Hero')
        self.projects.update_workspace(self.pid,{'action':'replace_asset','asset_id':a['asset_id'],'replacement_id':b['asset_id']},project['revision'])
        self.assertEqual(self.projects.get_project(other['project_id'])['assets'][0]['asset_id'],a['asset_id'])


    def test_creation_request_is_retry_safe_and_rejects_different_payload(self):
        import uuid
        request=str(uuid.uuid4())
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            created=list(pool.map(lambda _:self.projects.create_project('New film',request_id=request),range(4)))
        self.assertEqual(len({p['project_id'] for p in created}),1)
        with self.assertRaises(ValueError) as error:self.projects.create_project('Different film',request_id=request)
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(len(self.projects.list_projects()),2)
