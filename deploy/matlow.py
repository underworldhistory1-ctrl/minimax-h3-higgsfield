"""Install audited upstream packs independently, retaining their original licenses.

This module never imports third-party node code or changes Python dependencies.
Call only inside the launcher's drained-worker installation transaction.
"""
import json
import os
from pathlib import Path
import subprocess

PACKS={key:value for key,value in json.loads((Path(__file__).with_name('compatibility.json')).read_text(encoding='utf-8'))['optional_nodes'].items() if key in ('mainodes','dials')}


def git(path, *args):
    return subprocess.check_output(['git','-C',str(path),*args],text=True,encoding='utf-8',stderr=subprocess.PIPE,timeout=120).strip()


def prepare_pack(root, key, runner, changed):
    item=PACKS[key];target=Path(root)/'custom_nodes'/item['directory']
    if target.exists():
        if not (target/'.git').is_dir() or git(target,'remote','get-url','origin')!=item['repository'] or git(target,'status','--porcelain'):
            raise RuntimeError(f'{key} checkout is customized or unrecognized; existing files were preserved.')
        head=git(target,'rev-parse','HEAD')
        if head!=item['commit']:
            runner.run(['git','-C',target,'fetch','--filter=blob:none','origin',item['commit']])
            result=subprocess.run(['git','-C',str(target),'merge-base','--is-ancestor',head,item['commit']],capture_output=True)
            if result.returncode: raise RuntimeError(f'{key} has an unpublished or divergent revision; existing files were preserved.')
            changed();runner.run(['git','-C',target,'checkout','--detach',item['commit']])
        return target
    target.parent.mkdir(parents=True,exist_ok=True)
    staging=target.with_name('.h3-stage-'+target.name)
    if not staging.exists():
        runner.run(['git','clone','--filter=blob:none','--no-checkout','--depth','1',item['repository'],staging])
    if not (staging/'.git').is_dir() or git(staging,'remote','get-url','origin')!=item['repository']:
        raise RuntimeError(f'{key} staged download is unrecognized; it was preserved.')
    runner.run(['git','-C',staging,'fetch','--filter=blob:none','--depth','1','origin',item['commit']])
    # Source, web scripts, dial assets and licenses; omit videos and workflow demos.
    runner.run(['git','-C',staging,'sparse-checkout','set','--no-cone','/*','!/assets/','!/examples/','!/docs/','!/tests/','!/workflows/'])
    runner.run(['git','-C',staging,'checkout','--detach',item['commit']])
    if git(staging,'rev-parse','HEAD')!=item['commit'] or git(staging,'status','--porcelain'):
        raise RuntimeError(f'{key} did not verify; staged files were preserved.')
    changed();os.replace(staging,target)
    return target


def copy_dials(source, destination):
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=True)
    files=[p for p in Path(source).iterdir() if p.is_file() and (p.suffix=='.safetensors' or p.name.startswith(('LICENSE','NOTICE')))]
    # Check all conflicts before copying any file. Never replace a user's dial.
    for path in files:
        target=destination/path.name
        if target.exists() and target.read_bytes()!=path.read_bytes(): raise RuntimeError(f'Custom dial/license {target.name} was preserved; use a different name before installing the publisher library.')
    for path in files:
        target=destination/path.name
        if not target.exists():
            temporary=target.with_suffix(target.suffix+'.h3-tmp');temporary.write_bytes(path.read_bytes());os.replace(temporary,target)


def prepare(root, runner, changed):
    prepare_pack(root,'mainodes',runner,changed)
    source=prepare_pack(root,'dials',runner,changed)
    copy_dials(source/'dials',Path(root)/'models'/'loras'/'dials')


def requested(root, args, state):
    # Installed packs outlive the launcher's per-configuration state, including source updates.
    return bool(getattr(args,'matlow',False) or state.get('matlow_enabled') or all((Path(root)/'custom_nodes'/item['directory']).is_dir() for item in PACKS.values()))
