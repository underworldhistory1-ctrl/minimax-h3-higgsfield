# Continuous verification template

verify.yml is ready to copy to .github/workflows/verify.yml. It tests Linux and Windows with Python 3.12/3.13, CPU tensor and media paths, JavaScript, shell syntax, and release archive creation. It uses read-only repository permissions and never deploys or renders on a GPU.

Activation requires a repository credential permitted to create Actions workflows. The current OAuth login rejected the workflow push because it lacks the workflow scope; hosted CI was not enabled or run during the 2.7 release. The template is stored here so the runtime update can be published with the existing authorized credential. An owner can activate it from GitHub or a credential with the required scope.

Local equivalent (Python 3.12/3.13, Node 22+, FFmpeg on PATH):

```sh
python -m pip install -r tests/requirements.txt
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
python -m unittest discover -s tests -v
node --test tests/js/*.test.cjs
python deploy/build_final_folder.py --output release-test
```

These checks validate source and CPU behavior. They do not validate CUDA installation, GPU performance or perceptual output quality.
