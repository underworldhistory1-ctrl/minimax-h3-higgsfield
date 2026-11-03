# Continuous verification

The active workflow is [.github/workflows/verify.yml](../../.github/workflows/verify.yml). It tests Linux and Windows with Python 3.12/3.13, CPU tensor and media paths, JavaScript, shell syntax, and release archive creation. It uses read-only repository permissions and never deploys or renders on a GPU. It runs on pushes and pull requests, and supports manual dispatch. The adjacent verify.yml is a matching reference copy; update both when changing the workflow.

The workflow was activated through the repository owner's existing GitHub browser session on 2 November 2026. See [Actions](https://github.com/underworldhistory1-ctrl/minimax-h3-interface/actions/workflows/verify.yml) for the result of each exact commit. A configured workflow alone is not proof of a successful run.

Local equivalent (Python 3.12/3.13, Node 22+, FFmpeg on PATH):

```sh
python -m pip install -r tests/requirements.txt
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
python -m unittest discover -s tests -v
node --test tests/js/*.test.cjs
python deploy/build_final_folder.py --output release-test
```

These checks validate source and CPU behavior. They do not validate CUDA installation, GPU performance or perceptual output quality.
