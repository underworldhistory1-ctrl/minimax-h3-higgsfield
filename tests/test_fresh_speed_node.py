import os,pathlib,subprocess,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class FreshSpeedNodeTests(unittest.TestCase):
    @unittest.skipIf(os.name=='nt','Requires native Linux shell')
    def test_new_optional_checkout_fetches_before_integrity_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);origin=root/'origin';origin.mkdir()
            def git(*args):return subprocess.check_output(['git',*map(str,args)],text=True).strip()
            git('-C',origin,'init','-q');(origin/'__init__.py').write_text('# fixture')
            git('-C',origin,'add','.');git('-C',origin,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');revision=git('-C',origin,'rev-parse','HEAD')
            script=(ROOT/'deploy/bootstrap_h3_server.sh').read_text()
            function=script[script.index('install_speed_node() {'):script.index('if [[ "$WITH_SPEED_OPTIONS"',script.index('install_speed_node() {'))]
            env={**os.environ,'CUSTOM_NODES':str(root/'nodes'),'H3_PYTHON':sys.executable,'H3_STUDIO':str(ROOT)}
            subprocess.run(['bash','-ec',function+'\ninstall_speed_node fixture "$1" "$2"','test',str(origin),revision],env=env,check=True,capture_output=True)
            self.assertEqual(git('-C',root/'nodes/fixture','rev-parse','HEAD'),revision)
