"""Scene schema and ownership operations; selection remains browser-local."""
import copy
import re
import uuid

ACTIONS = {f'{verb}_{kind}' for kind in ('scene','shot') for verb in ('create','rename','duplicate','delete')} | {'reorder_scenes','reorder_shots','adopt_legacy_shot'}

def validate_scenes(scenes):
    from .projects import workspace_name
    if not isinstance(scenes,list) or len(scenes)>1000: raise ValueError('Scenes must be an array of at most 1000 scenes')
    seen=set()
    for scene in scenes:
        if not isinstance(scene,dict): raise ValueError('Invalid scene')
        _identity(scene.get('scene_id'),'scene',seen)
        workspace_name(scene.get('name'))
        shots=scene.get('shots')
        if not isinstance(shots,list) or len(shots)>1000: raise ValueError('Invalid shots array')
        for shot in shots:
            if not isinstance(shot,dict): raise ValueError('Invalid shot')
            _identity(shot.get('shot_id'),'shot',seen)
            workspace_name(shot.get('name'))
            if not isinstance(shot.get('draft'),dict): raise ValueError('Shot draft must be an object')

def _identity(value,kind,seen):
    if not isinstance(value,str) or not re.fullmatch(kind+r'_[a-f0-9]{32}',value) or value in seen: raise ValueError('Invalid or duplicate '+kind+' identity')
    seen.add(value)

def target_shot(project,scene_id,shot_id):
    scene=next((s for s in project.get('scenes',[]) if s['scene_id']==scene_id),None)
    if not scene: raise ValueError('Scene is not in this project')
    shot=next((s for s in scene['shots'] if s['shot_id']==shot_id),None)
    if not shot: raise ValueError('Shot is not in this scene')
    return shot

def references(value,ids):
    if isinstance(value,dict): return any((k in ('scene_id','shot_id','clip_id','source_scene_id','source_shot_id') and isinstance(v,str) and v in ids) or references(v,ids) for k,v in value.items())
    if isinstance(value,list): return any(references(v,ids) for v in value)
    return False

def protect_delete(project,scene_id,shot_ids,jobs=None,whole_scene=False):
    ids=set(shot_ids) | ({scene_id} if whole_scene else set())
    retained=copy.deepcopy(project)
    retained['scenes']=[{**s,'shots':[sh for sh in s['shots'] if sh['shot_id'] not in ids]} for s in retained.get('scenes',[]) if not (whole_scene and s['scene_id']==scene_id)]
    if references(retained,ids): raise ValueError('Scene or shot is referenced by saved work; deletion stopped')
    if jobs:
        for job in jobs.project_jobs(project['project_id']):
            if job.get('state') in ('failed','cancelled','canceled','completed'):
                continue
            snapshot = (job.get('render_spec') or {}).get('project_snapshot') or {}
            if not isinstance(snapshot, dict) or not snapshot.get('scene_id') or not snapshot.get('shot_id') or references(job,ids):
                raise ValueError('Scene or shot has an active or uncertain job')

def operate(project,op,jobs=None):
    from .projects import workspace_name
    action=op['action']; scenes=project.setdefault('scenes',[])
    scene=next((s for s in scenes if s['scene_id']==op.get('scene_id')),None)
    if action=='create_scene':
        scenes.append({'scene_id':'scene_'+uuid.uuid4().hex,'name':workspace_name(op.get('name')),'shots':[]}); return
    if action=='reorder_scenes': _reorder(scenes,op.get('scene_ids'),'scene_id'); return
    if not scene: raise ValueError('Scene is not in this project')
    if action=='rename_scene': scene['name']=workspace_name(op.get('name'))
    elif action=='duplicate_scene':
        duplicate=copy.deepcopy(scene);duplicate['scene_id']='scene_'+uuid.uuid4().hex;duplicate['name']=workspace_name(op.get('name'))
        for sh in duplicate['shots']: sh['shot_id']='shot_'+uuid.uuid4().hex
        scenes.insert(scenes.index(scene)+1,duplicate)
    elif action=='delete_scene':
        protect_delete(project,scene['scene_id'],[s['shot_id'] for s in scene['shots']],jobs,True);scenes.remove(scene)
    elif action in ('create_shot','adopt_legacy_shot'):
        scene['shots'].append({'shot_id':'shot_'+uuid.uuid4().hex,'name':workspace_name(op.get('name')),'draft':copy.deepcopy(project.get('draft',{})) if action=='adopt_legacy_shot' else {}})
    elif action=='reorder_shots': _reorder(scene['shots'],op.get('shot_ids'),'shot_id')
    else:
        shot=target_shot(project,scene['scene_id'],op.get('shot_id'))
        if action=='rename_shot': shot['name']=workspace_name(op.get('name'))
        elif action=='duplicate_shot':
            duplicate=copy.deepcopy(shot);duplicate['shot_id']='shot_'+uuid.uuid4().hex;duplicate['name']=workspace_name(op.get('name'));scene['shots'].insert(scene['shots'].index(shot)+1,duplicate)
        elif action=='delete_shot': protect_delete(project,scene['scene_id'],[shot['shot_id']],jobs);scene['shots'].remove(shot)

def _reorder(items,ids,key):
    if not isinstance(ids,list) or any(not isinstance(i,str) for i in ids) or len(ids)!=len(items) or len(set(ids))!=len(ids) or set(ids)!={s[key] for s in items}: raise ValueError('Order must be an exact permutation')
    by_id={s[key]:s for s in items};items[:]=[by_id[i] for i in ids]
