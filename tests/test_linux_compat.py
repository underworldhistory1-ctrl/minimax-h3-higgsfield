import importlib.util,pathlib,subprocess,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class MemfdTests(unittest.TestCase):
 def test_preserves_existing_implementation_and_non_linux(self):
  import types
  from unittest.mock import patch
  spec=importlib.util.spec_from_file_location('linux_compat',ROOT/'linux_compat.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  original=object()
  with patch.object(m,'os',types.SimpleNamespace(memfd_create=original)),patch.object(m,'sys',types.SimpleNamespace(platform='linux')):
   m.ensure_memfd();self.assertIs(m.os.memfd_create,original)
  with patch.object(m,'os',types.SimpleNamespace()),patch.object(m,'sys',types.SimpleNamespace(platform='win32')):
   m.ensure_memfd();self.assertFalse(hasattr(m.os,'memfd_create'))
