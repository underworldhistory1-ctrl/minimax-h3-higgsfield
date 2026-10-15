#!/usr/bin/env python3
"""One resumable H3 installation entry point. No GPU job is silently repeated."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

PROJECT = Path(__file__).resolve().parents[1]
VERSION = 1


def redact(value):
    value = str(value)
    for key in ("H3_ACCESS_TOKEN", "H3_INSTANCE_PASSWORD", "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"):
        secret = os.environ.get(key)
        if secret:
            value = value.replace(secret, "[redacted]")
    value = re.sub(r"([?&](?:arg|token|access_token)=)[^\s&#]+", r"\1[redacted]", value, flags=re.I)
    return value


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_source_receipt(root):
    """Expose updates only for a clean, official main checkout kept outside runtime."""
    root = Path(root).resolve()
    receipt = root / '.h3-launcher/source.json'
    def git(*args):
        return subprocess.check_output(['git', '-C', str(PROJECT), *args], text=True, stderr=subprocess.DEVNULL).strip()
    try:
        accepted = {'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield',
                    'https://github.com/underworldhistory1-ctrl/minimax-h3-higgsfield.git',
                    'git@github.com:underworldhistory1-ctrl/minimax-h3-higgsfield.git'}
        runtime = runtime_target(root).resolve()
        if (PROJECT.resolve() == runtime or git('remote', 'get-url', 'origin') not in accepted
                or git('branch', '--show-current') != 'main'
                or git('status', '--porcelain', '--untracked-files=no')):
            receipt.unlink(missing_ok=True)
            return False
        commit = git('rev-parse', 'HEAD')
        if not re.fullmatch(r'[0-9a-f]{40}', commit):
            receipt.unlink(missing_ok=True)
            return False
    except (OSError, subprocess.CalledProcessError):
        receipt.unlink(missing_ok=True)
        return False
    atomic_json(receipt, {'source_root': str(PROJECT.resolve()), 'comfy_root': str(root),
                          'runtime_root': str(runtime), 'installed_commit': commit})
    return True


def load_state(path, config):
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    if Path(path).is_file():
        try:
            previous = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise RuntimeError("Installation state is unreadable; preserve it and repair state.json before continuing") from error
        if previous.get("version") != VERSION:
            raise RuntimeError("Unsupported state version; use the matching launcher or a separate --state-dir")
        if previous.get("fingerprint") == fingerprint:
            return previous
        # A pending smoke job must remain observable under its original config.
        if previous.get("smoke", {}).get("status") in ("submitting", "submission_uncertain", "running", "timeout", "downloaded"):
            raise RuntimeError("A smoke job belongs to the previous configuration. Resume that configuration before changing options.")
    return {"version": VERSION, "fingerprint": fingerprint, "config": config,
            "stages": {}, "smoke": {}, "files_prepared": False,
            "api_ready": False, "gpu_validated": False}


class InstallLock:
    """OS-held lock: a crashed process releases it without unsafe stale PID guessing."""
    def __init__(self, path):
        self.path = Path(path)

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.file = self.path.open("a+b")
        try:
            # Another Windows process can lock even a read of byte zero.
            if self.path.stat().st_size == 0:
                self.file.write(b"0")
                self.file.flush()
            self.file.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.file.close()
            raise RuntimeError("Another H3 installer is already running for this ComfyUI") from error
        return self

    def __exit__(self, *_):
        if os.name == "nt":
            import msvcrt
            self.file.seek(0)
            msvcrt.locking(self.file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(self.file, fcntl.LOCK_UN)
        self.file.close()


def process_candidates():
    """Only examine Python commands running main.py; never dump full process data."""
    found = []
    if os.name == "nt":
        script = r'''Get-CimInstance Win32_Process | Where-Object {
 $_.Name -match '^python.*\.exe$' -and $_.CommandLine -match 'main\.py'
} | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'''
        result = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            records = json.loads(result.stdout)
            for item in records if isinstance(records, list) else [records]:
                matches = re.findall(r'(?:"([^"]*main\.py)"|([^\s"]*main\.py))', item.get("CommandLine") or "")
                for pair in matches:
                    path = Path(pair[0] or pair[1])
                    if path.is_absolute() and path.is_file():
                        found.append((path.parent.resolve(), Path(item["ExecutablePath"])))
    else:
        for proc in Path("/proc").glob("[0-9]*"):
            try:
                args = (proc / "cmdline").read_bytes().decode().split("\0")
                if not args or "python" not in Path(args[0]).name.lower():
                    continue
                main = next((arg for arg in args[1:] if Path(arg).name == "main.py"), None)
                if main:
                    cwd = (proc / "cwd").resolve()
                    root = (cwd / main).resolve().parent
                    interpreter = Path(args[0])
                    if not interpreter.is_absolute():
                        interpreter = Path(os.readlink(proc / "exe"))
                    if (root / "main.py").is_file():
                        found.append((root, interpreter))
            except (OSError, UnicodeError, StopIteration):
                continue
    return found


def discover_comfy(raw=None, candidates=None):
    if raw:
        root = Path(raw).expanduser().resolve()
        if (root / "ComfyUI" / "main.py").is_file():
            root /= "ComfyUI"
        return root
    if candidates is None:
        home = Path.home()
        candidates = [root for root, _ in process_candidates()]
        candidates += [PROJECT.parent / "ComfyUI", Path("/app/ComfyUI"), Path("/workspace/ComfyUI"),
                       Path("/output/h3-stack/ComfyUI/ComfyUI"), home / "ComfyUI",
                       PROJECT.parent / "ComfyUI_windows_portable/ComfyUI",
                       home / "Desktop/ComfyUI_windows_portable/ComfyUI"]
        candidates += [default_fresh_root()]
        candidates += [parent for parent in PROJECT.parents if (parent / "main.py").is_file()]
    roots = sorted({Path(p).resolve() for p in candidates if (Path(p) / "main.py").is_file()})
    if len(roots) > 1:
        raise RuntimeError("Multiple ComfyUI installations found; pass --comfy-root: " + ", ".join(map(str, roots)))
    return roots[0] if roots else default_fresh_root()


def default_fresh_root():
    if os.environ.get("H3_COMFY_ROOT"):
        return Path(os.environ["H3_COMFY_ROOT"]).expanduser().resolve()
    # A remote archive extracted into /tmp must never own a new model installation.
    if os.name != "nt":
        if Path("/workspace").is_dir():
            return Path("/workspace/ComfyUI")
        if Path("/output").is_dir():
            return Path("/output/h3-stack/ComfyUI/ComfyUI")
        return (Path.home() / "h3-stack/ComfyUI").resolve()
    return (PROJECT.parent / "ComfyUI").resolve()


def discover_python(root, override=None):
    if override:
        value = Path(override).expanduser().absolute()
        if not value.is_file():
            raise RuntimeError("--comfy-python does not exist")
        return value
    names = [root.parent / "python_embeded/python.exe", root / ".venv/Scripts/python.exe",
             root / "venv/Scripts/python.exe"] if os.name == "nt" else [root / ".venv/bin/python", root / "venv/bin/python"]
    for name in names:
        if name.is_file():
            return name.absolute()
    interpreters = {python.absolute() for folder, python in process_candidates() if folder == root and python.is_file()}
    if len(interpreters) == 1:
        return interpreters.pop()
    if owned_environment(root):
        return None
    if (root / "main.py").is_file():
        raise RuntimeError("Existing ComfyUI interpreter is unknown; supply --comfy-python once. Its environment will not be guessed or replaced.")
    return None


def owned_environment(root):
    for path in (root / ".h3-launcher/state.json", root / ".h3-launcher-owned.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("version") == VERSION and data.get("fresh_install") is True and data.get("config", {}).get("root") == str(root):
                return True
        except (OSError, ValueError, AttributeError):
            pass
    return False


def storage_roots(root, explicit, python=None):
    candidates = [root / "models", *map(Path, explicit)]
    for name in ("diffusion_models", "text_encoders", "vae", "loras", "model_patches", "latent_upscale_models"):
        category = root / "models" / name
        if category.is_dir():
            candidates.append(category.resolve())
    if not explicit:
        for base in (Path("/input0"), Path("/input1"), Path("/mnt"), Path("/workspace"), Path("/output"), Path("/media")):
            if base.is_dir():
                candidates.append(base)
    config = root / "extra_model_paths.yaml"
    if config.is_file() and python:
        script = '''import yaml,json,pathlib,sys
p=pathlib.Path(sys.argv[1]); data=yaml.safe_load(p.read_text()) or {}; result=[]
for group in data.values():
 if not isinstance(group,dict): continue
 base=pathlib.Path(str(group.get('base_path',p.parent))).expanduser()
 if not base.is_absolute(): base=p.parent/base
 for key,value in group.items():
  if key in ('base_path','is_default') or not isinstance(value,str): continue
  for part in value.splitlines():
   if part.strip(): result.append(str((base/part.strip()).resolve()))
print(json.dumps(result))'''
        result = subprocess.run([str(python), "-c", script, str(config)], capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError("Cannot read extra_model_paths.yaml safely using ComfyUI's Python; repair it or pass a supported configuration")
        candidates += map(Path, json.loads(result.stdout))
    return list(dict.fromkeys(p.expanduser().resolve() for p in candidates if p.is_dir()))


def transient_failure(message):
    lowered = message.lower()
    if any(word in lowered for word in ("unauthorized", "forbidden", "401", "403", "404", "no space", "permission denied", "local edits", "out of memory")):
        return False
    return any(word in lowered for word in ("connection reset", "connection aborted", "temporary failure", "timed out", "timeout", "502", "503", "504", "429", "could not resolve"))


class Runner:
    def __init__(self, directory):
        self.directory = directory
        self.log = directory / "install.log"

    def emit(self, message):
        message = redact(message)
        print(message, flush=True)
        with self.log.open("a", encoding="utf-8") as stream:
            stream.write(message + "\n")

    def run(self, command, env=None, cwd=None, retries=2):
        for attempt in range(retries + 1):
            tail = []
            self.emit("Running: " + " ".join(str(item) for item in command))
            process = subprocess.Popen([str(item) for item in command], cwd=cwd, env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       encoding="utf-8", errors="replace",
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            for line in process.stdout:
                self.emit(line.rstrip())
                tail = (tail + [redact(line.rstrip())])[-40:]
            code = process.wait()
            if code == 0:
                return
            message = "\n".join(tail)
            if attempt < retries and transient_failure(message):
                self.emit(f"Temporary network failure; retry {attempt + 1}/{retries} from verified cached files.")
                time.sleep(min(2 ** attempt * 2, 8))
                continue
            raise RuntimeError(f"Setup command failed ({code}): " + message[-4000:])


def prerequisites(runner):
    gpu = shutil.which("nvidia-smi")
    if os.name == "nt" and not gpu:
        candidate = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/nvidia-smi.exe"
        if candidate.is_file():
            gpu = str(candidate)
    if not gpu:
        raise RuntimeError("A working NVIDIA driver is required. Driver changes require provider/administrator action; no GPU install was attempted.")
    runner.run([gpu, "-L"], retries=0)
    needed = [name for name in ("git", "ffmpeg", "ffprobe") if not shutil.which(name)]
    if os.name != "nt":
        needed += [name for name in ("curl", "tar", "python3") if not shutil.which(name)]
    if not needed:
        return
    if os.name == "nt":
        winget = shutil.which("winget")
        if not winget:
            raise RuntimeError("Missing " + ", ".join(needed) + "; Windows Package Manager is unavailable")
        for package in (["Git.Git"] if "git" in needed else []) + (["Gyan.FFmpeg"] if any(n in needed for n in ("ffmpeg", "ffprobe")) else []):
            runner.run([winget, "install", "--id", package, "--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
        for folder in (Path("C:/Program Files/Git/cmd"), Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WinGet/Links"):
            if folder.is_dir():
                os.environ["PATH"] = str(folder) + os.pathsep + os.environ.get("PATH", "")
    else:
        apt = shutil.which("apt-get")
        prefix = [] if os.geteuid() == 0 else ["sudo", "-n"]
        if not apt or (prefix and not shutil.which("sudo")):
            raise RuntimeError("Missing tools: " + ", ".join(needed) + "; install them with your package manager or provide administrator access")
        env = dict(os.environ, DEBIAN_FRONTEND="noninteractive")
        runner.run([*prefix, apt, "update", "-qq"], env=env)
        runner.run([*prefix, apt, "install", "-y", "-qq", "git", "curl", "ffmpeg", "tar", "python3-venv", "python3-pip", "libgl1"], env=env)
    if any(not shutil.which(name) for name in needed):
        raise RuntimeError("Installed prerequisite tools are not discoverable. Open a fresh terminal and rerun; existing downloads are retained.")


def runtime_snapshot(root, state_dir):
    """Backup only H3 runtime files and remember original Git revision; never copy weights."""
    snapshot = {"comfy_revision": None, "extension_backup": None}
    if (root / ".git").is_dir():
        result = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True)
        if result.returncode == 0:
            snapshot["comfy_revision"] = result.stdout.strip()
    extension = runtime_target(root)
    if extension.is_dir():
        backup = state_dir / "backups" / dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        names = ["__init__.py", "h3_video_save.py", "qwen_image.py", "h3_continuation.py", "h3_queue_bridge.py", "h3_audio_refine.py", "prompt_formats.py", "promptwriter.py", "web", "h3_lab", "corpus", "tools"]
        for name in names:
            old = extension / name
            target = backup / name
            if old.is_dir():
                shutil.copytree(old, target, ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
            elif old.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(old, target)
        snapshot["extension_backup"] = str(backup)
    return snapshot


def setup_runtime(args, root, python, runner):
    env = dict(os.environ, H3_LAUNCHER_INTERNAL="1", H3_MODELS_PREPARED="1",
               H3_LAUNCHER_URL=args.url or f"http://127.0.0.1:{args.port}",
               H3_INSTALL_TURBO="1" if args.turbo else "0",
               H3_INSTALL_REFINE="0" if args.no_refine else "1",
               H3_INSTALL_CONTROLNET="0" if args.no_controlnet else "1",
               QWEN_IMAGE_PROFILES=args.qwen_image_profiles, PYTHONUNBUFFERED="1")
    if python:
        env["COMFY_PYTHON"] = str(python)
    if os.name == "nt":
        command = [sys.executable, PROJECT / "deploy/install_windows.py", "--comfy-root", root,
                   "--port", str(args.port), "--bind", args.bind, "--no-start"]
        if python:
            command += ["--comfy-python", python]
        if args.no_refine:
            command += ["--no-refine"]
        if not args.no_controlnet:
            command += ["--controlnet"]
        if args.qwen_image_profiles:
            command += ["--qwen-image-profiles", args.qwen_image_profiles]
    else:
        command = ["bash", PROJECT / "install.sh", "--comfy-root", root,
                   "--port", str(args.port), "--bind", args.bind, "--no-start"]
    runner.run(command, env=env)
    return discover_python(root, str(python) if python else None)


def environment_ready(python, args):
    if python is None:
        return False
    modules = "torch,av,aiohttp,PIL,comfyui_frontend_package"
    if not args.no_refine:
        modules += ",einops,safetensors,typing_extensions"
    if not args.no_controlnet:
        modules += ",onnxruntime,cv2,scipy,skimage"
    result = subprocess.run([str(python), "-c", "import " + modules + "; assert torch.cuda.is_available(); "
                             "assert torch.ones(1,device='cuda').sum().item() == 1; torch.cuda.synchronize()"],
                            capture_output=True, text=True)
    return result.returncode == 0


def audit_environment(python):
    probe = subprocess.run([str(python), str(PROJECT/'deploy/environment_audit.py')], capture_output=True, text=True, timeout=90)
    if probe.returncode:
        raise RuntimeError('Environment audit could not complete; services were not started.')
    return json.loads(probe.stdout)


def optional_nodes_ready(root, args):
    from importlib import import_module
    installer = import_module("deploy.install_windows") if __package__ else import_module("install_windows")
    required = [*installer.SPEED_NODES, installer.CONTEXT_NODE]
    if not args.no_refine:
        required.append(("Comfyui_Minimax_h3_latent_Upscaler", "https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler.git", "40316cf008b2fd8663263270669eb4da23f89d2c"))
    if not args.no_controlnet:
        required.append(("comfyui_controlnet_aux", "https://github.com/Fannovel16/comfyui_controlnet_aux.git", "0cd290477128d42cdc3e76a826a402d866e8c684"))
    for name, url, revision in required:
        path = root / "custom_nodes" / name
        if not (path / ".git").is_dir():
            return False
        head = subprocess.run(["git", "-C", str(path), "rev-parse", "HEAD"], capture_output=True, text=True)
        origin = subprocess.run(["git", "-C", str(path), "remote", "get-url", "origin"], capture_output=True, text=True)
        if head.returncode or head.stdout.strip() != revision or origin.stdout.strip() != url:
            return False
    return True


def loaded_source_fingerprint(root):
    # Direct script execution also needs the source root on its module path.
    if str(PROJECT) not in sys.path:
        sys.path.insert(0, str(PROJECT))
    from h3_lab.runtime_fingerprint import runtime_fingerprint
    return runtime_fingerprint(runtime_target(root))


def prepare_source(root, python, runner):
    """Initialize fresh source without mistaking launcher-owned state for user data."""
    if (root / "main.py").is_file():
        if python is None and owned_environment(root):
            runner.run([sys.executable, "-m", "venv", root / ".venv"])
            return root / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
        return python
    allowed = {".h3-launcher", ".h3-launcher.lock", ".h3-launcher-owned.json", ".git", ".venv"}
    unexpected = [path.name for path in root.iterdir() if path.name not in allowed]
    if unexpected:
        raise RuntimeError("Refusing a fresh install into a nonempty directory: " + ", ".join(unexpected))
    from importlib import import_module
    installer = import_module("deploy.install_windows") if __package__ else import_module("install_windows")
    if not (root / ".git").is_dir():
        runner.run(["git", "init", "-q", root])
        runner.run(["git", "-C", root, "remote", "add", "origin", "https://github.com/Comfy-Org/ComfyUI.git"])
    origin = subprocess.run(["git", "-C", str(root), "remote", "get-url", "origin"], capture_output=True, text=True)
    if origin.stdout.strip() != "https://github.com/Comfy-Org/ComfyUI.git":
        raise RuntimeError("Fresh ComfyUI source has an unexpected origin; it was not overwritten")
    runner.run(["git", "-C", root, "fetch", "--depth", "1", "origin", installer.COMFY_REVISION])
    runner.run(["git", "-C", root, "checkout", "--detach", "-q", "FETCH_HEAD"])
    if python is None:
        host = sys.executable
        if os.name == "nt" and not (3, 12) <= sys.version_info[:2] <= (3, 13):
            raise RuntimeError("A fresh Windows environment needs Python 3.12/3.13; use the PowerShell launcher to select it automatically")
        runner.run([host, "-m", "venv", root / ".venv"])
        python = root / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv/bin/python")
    return python


def wait_for_install_idle(api, timeout):
    if api.queue().get("status") != "offline" and not api.wait_idle(timeout):
        raise RuntimeError("ComfyUI queue did not become idle before timeout; no runtime files were changed")


def runtime_target(root):
    from importlib import import_module
    installer = import_module("deploy.install_windows") if __package__ else import_module("install_windows")
    return installer.runtime_target(root)


def runtime_matches(root):
    return all((runtime_target(root) / name).is_file()
               and (runtime_target(root) / name).read_bytes() == (PROJECT / name).read_bytes()
               for name in runtime_files())


def runtime_files():
    from importlib import import_module
    installer = import_module("deploy.install_windows") if __package__ else import_module("install_windows")
    names = set(installer.RUNTIME_FILES)
    if os.name != "nt":
        names |= {"deploy/download_h3_models.sh", "deploy/bootstrap_h3_server.sh"}
    return sorted(names)


def protect_runtime_edits(root):
    target = runtime_target(root)
    if not target.exists():
        return
    known = json.loads((PROJECT / "deploy/runtime_hashes.json").read_text(encoding="utf-8"))
    customized = []
    for name in runtime_files():
        installed = target / name
        if not installed.is_file():
            continue
        content = installed.read_bytes()
        if content == (PROJECT / name).read_bytes():
            continue
        digest = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
        digests = {digest}
        if installed.suffix.lower() in {".py", ".js", ".ps1", ".sh", ".html", ".css", ".json", ".md", ".txt", ".yaml", ".yml"}:
            normalized = content.replace(b"\r\n", b"\n")
            digests.add(hashlib.sha1(b"blob " + str(len(normalized)).encode() + b"\0" + normalized).hexdigest())
        if not digests.intersection(known.get(name, [])):
            customized.append(name)
    if customized:
        raise RuntimeError("H3 runtime has customized or unrecognized files; preserve/review them before upgrading: " + ", ".join(customized[:12]))


def model_overlay(root, artifacts):
    """Keep linked external model disks read-only; fill gaps in a local overlay."""
    models = root / "models"
    linked = models.is_symlink() or (hasattr(models, "is_junction") and models.is_junction())
    for artifact in artifacts:
        if not artifact.relative_path.startswith("models/"):
            continue
        parent = (root / artifact.relative_path).parent
        while not parent.exists():
            parent = parent.parent
        if (root.exists() and not parent.resolve().is_relative_to(root.resolve())) or not os.access(parent, os.W_OK):
            linked = True
        if hasattr(os, "statvfs") and os.statvfs(parent).f_flag & getattr(os, "ST_RDONLY", 1):
            linked = True
    overlay = root / ".h3-launcher-models"
    if not linked and not overlay.exists():
        return artifacts, None
    from dataclasses import replace
    return [replace(item, relative_path=".h3-launcher-models/" + item.relative_path[7:])
            if item.relative_path.startswith("models/") else item for item in artifacts], overlay


def configure_overlay(root, overlay, python, before_change=None):
    if overlay is None:
        return False
    config = root / "extra_model_paths.yaml"
    source = config.read_text(encoding="utf-8") if config.is_file() else ""
    start, end = "# BEGIN H3 LAUNCHER MODEL OVERLAY", "# END H3 LAUNCHER MODEL OVERLAY"
    base = json.dumps(str(overlay).replace("\\", "/"))
    section = f"{start}\nh3_launcher_overlay:\n  base_path: {base}\n"
    section += "".join(f"  {name}: {name}\n" for name in ("diffusion_models", "text_encoders", "vae", "loras", "model_patches", "latent_upscale_models"))
    section += end
    if start in source:
        if source.count(start) != 1 or source.count(end) != 1:
            raise RuntimeError("Ambiguous existing H3 model overlay configuration")
        previous = source[source.index(start):source.index(end) + len(end)]
        updated = source.replace(previous, section)
    else:
        if "h3_launcher_overlay:" in source:
            raise RuntimeError("User configuration already defines h3_launcher_overlay; rename that entry before continuing")
        updated = source.rstrip() + "\n\n" + section + "\n"
    if updated == source:
        return False
    # Validate combined YAML before changing a user configuration.
    validation = subprocess.run([str(python), "-c", "import sys,yaml; assert isinstance(yaml.safe_load(sys.stdin.read()),dict)"],
                                input=updated, capture_output=True, text=True)
    if validation.returncode:
        raise RuntimeError("extra_model_paths.yaml could not be safely extended; original file retained")
    if config.exists():
        saved = config.with_name("extra_model_paths.before-h3-" + dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f") + ".yaml")
        shutil.copy2(config, saved)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=root, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(updated)
    try:
        if before_change is not None:
            before_change()
        os.replace(temporary, config)
    finally:
        temporary.unlink(missing_ok=True)
    return True


def start_server(api, root, python, args, runner, state, save):
    queue = api.queue()
    if queue.get("status") != "offline":
        if not api.wait_idle(args.queue_timeout):
            raise RuntimeError("Queue is busy; runtime was prepared but no restart was attempted")
        try:
            before = api.request("/h3_studio/readiness")
            previous_instance = before.get("runtime_instance") if isinstance(before, dict) else None
        except RuntimeError:
            before = {}
            previous_instance = None
        expected = loaded_source_fingerprint(root)
        already_loaded = isinstance(before, dict) and before.get("runtime_fingerprint") == expected
        pending = state.get("restart_pending", False)
        if already_loaded and (not pending or previous_instance != state.get("pre_update_instance")):
            state["restart_pending"] = False
            save()
            return
        try:
            api.request("/v2/manager/reboot", {})
        except Exception as error:
            # Reboot may replace the worker before its HTTP response arrives.
            if "404" in str(error) or "403" in str(error) or "401" in str(error):
                raise RuntimeError("The existing server cannot be restarted through Manager. Restart it using your provider, then rerun. No unmanaged process was stopped.") from error
        state["restart_requested"] = True
        save()
    else:
        previous_instance = None
        command = [str(python), "main.py", "--listen", args.bind, "--port", str(args.port), "--reserve-vram", "3.0", "--use-pytorch-cross-attention"]
        if python.parent.name.lower() == "python_embeded":
            command.append("--windows-standalone-build")
        else:
            # Conservative memory defaults for container rentals; optional cache stays off.
            command += ["--cache-none", "--fp16-intermediates"]
        with (root / "h3-higgsfield-server.log").open("a", encoding="utf-8") as log:
            child = subprocess.Popen(command, cwd=root, stdin=subprocess.DEVNULL, stdout=log,
                                     stderr=subprocess.STDOUT, env=os.environ.copy(),
                                     start_new_session=os.name != "nt",
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        atomic_json(root / ".h3-launcher-process.json", {"pid": child.pid, "python": str(python), "root": str(root)})
        state["managed_pid"] = child.pid
        save()
    deadline = time.monotonic() + args.start_timeout
    while time.monotonic() < deadline:
        try:
            ready = api.request("/h3_studio/readiness")
            if (isinstance(ready, dict) and ready.get("models") and ready.get("nodes")
                    and ready.get("runtime_instance") and ready["runtime_instance"] != previous_instance
                    and ready.get("runtime_fingerprint") == loaded_source_fingerprint(root)):
                state["restart_pending"] = False
                state["loaded_runtime_instance"] = ready["runtime_instance"]
                save()
                return
        except (OSError, ValueError, RuntimeError):
            pass
        time.sleep(2)
    raise RuntimeError("ComfyUI did not return ready before timeout. Inspect h3-higgsfield-server.log; rerun to recheck without losing downloaded files.")


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('--ui-update', help=argparse.SUPPRESS)
    result.add_argument('--ui-update-staged', action='store_true', help=argparse.SUPPRESS)
    result.add_argument("--comfy-root")
    result.add_argument("--comfy-python", default=os.environ.get("COMFY_PYTHON"))
    result.add_argument("--models-root", action="append", default=[], help="Attached storage directory; repeat for multiple disks")
    result.add_argument("--state-dir", type=Path)
    result.add_argument("--port", type=int, default=8188)
    result.add_argument("--bind", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
    result.add_argument("--url", help="Current ComfyUI URL; credentials come from environment variables")
    result.add_argument("--turbo", action="store_true", help=argparse.SUPPRESS)
    result.add_argument("--checkpoint", choices=('singularity-int8',), help="Explicit opt-in to an optional 20.97 GB community checkpoint")
    result.add_argument("--hybrid", action="store_true", help="Prepare the pinned community hybrid loader (no new model downloads)")
    result.add_argument("--update-policy", choices=('latest','notify','verified'), default='latest', help="Automatically update official main (default), notify only, or apply manifest-approved commits")
    result.add_argument("--video-only", action="store_true", help="Omit Qwen Image weights")
    result.add_argument("--qwen-image-profiles", choices=("", "int8", "bf16", "int8,bf16"), default=os.environ.get("QWEN_IMAGE_PROFILES", "int8"))
    result.add_argument("--no-controlnet", action="store_true")
    result.add_argument("--no-refine", action="store_true")
    result.add_argument("--refine", action="store_true", help=argparse.SUPPRESS)
    result.add_argument("--controlnet", action="store_true", help=argparse.SUPPRESS)
    result.add_argument("--no-update", action="store_true", help="Use this checkout offline without fetching latest main")
    result.add_argument("--no-start", action="store_true", help="Prepare files only; no API/GPU readiness claim")
    result.add_argument("--skip-smoke", action="store_true", help="Skip GPU job; report API readiness only")
    result.add_argument("--preflight", "--plan", dest="plan", action="store_true", help="Read-only discovery and missing-file plan")
    result.add_argument("--status", action="store_true", help="Read saved report without changes")
    result.add_argument("--queue-timeout", type=int, default=3600)
    result.add_argument("--start-timeout", type=int, default=300)
    result.add_argument("--smoke-timeout", type=int, default=3600)
    return result


def main():
    args = parser().parse_args()
    if args.ui_update:
        if not args.comfy_root:
            raise RuntimeError('UI update requires the verified ComfyUI root')
        if __package__:
            from .ui_update import code_only_update
        else:
            from ui_update import code_only_update
        return code_only_update(args.comfy_root, args.ui_update, args.ui_update_staged)
    if args.turbo:
        raise RuntimeError('Turbo has been removed. Existing files are preserved but not loaded or downloaded.')
    if not (args.no_update or args.status or args.plan):
        if __package__:
            from .update_source import update_source
        else:
            from update_source import update_source
        def guard_source_update():
            if __package__:
                from .launcher_smoke import ComfyAPI
            else:
                from launcher_smoke import ComfyAPI
            wait_for_install_idle(ComfyAPI(args.url or f'http://127.0.0.1:{args.port}'), args.queue_timeout)
        if update_source(PROJECT, args.update_policy, before_update=guard_source_update):
            os.execv(sys.executable, [sys.executable, str(PROJECT / "deploy/launcher.py"), *sys.argv[1:]])
    if not 1 <= args.port <= 65535 or min(args.queue_timeout, args.start_timeout, args.smoke_timeout) <= 0:
        raise RuntimeError("Port and timeouts must be positive and valid")
    root = discover_comfy(args.comfy_root)
    directory = args.state_dir.resolve() if args.state_dir else root / ".h3-launcher"
    if args.status:
        report = directory / "report.json"
        print(report.read_text(encoding="utf-8") if report.is_file() else "No saved installation report yet.")
        return 0
    python = discover_python(root, args.comfy_python)
    if args.video_only:
        args.qwen_image_profiles = ""
    roots = storage_roots(root, args.models_root, python)
    # Keep direct execution and package imports equally usable.
    if __package__:
        from .launcher_models import manifest, plan_models, prepare_models
        from .launcher_smoke import ComfyAPI, run_smoke
    else:
        from launcher_models import manifest, plan_models, prepare_models
        from launcher_smoke import ComfyAPI, run_smoke
    artifacts = manifest(turbo=args.turbo, refine=not args.no_refine,
                         controlnet=not args.no_controlnet, qwen_profiles=args.qwen_image_profiles, checkpoint=args.checkpoint)
    artifacts, overlay = model_overlay(root, artifacts)
    if args.plan:
        plan = plan_models(root, roots, artifacts, directory)
        print(json.dumps({"comfy_root": str(root), "python": str(python) if python else "new isolated environment",
                          "model_roots": list(map(str, roots)), "missing_bytes": plan["missing_bytes"],
                          "files": [{"target": str(item["target"]), "action": item["action"],
                                     "source": str(item.get("source")) if item.get("source") else None} for item in plan["items"]]}, indent=2))
        return 0
    url = args.url or f"http://127.0.0.1:{args.port}"
    if "?" in url or "@" in url:
        raise RuntimeError("Supply an HTTP(S) URL without credentials or query tokens; set H3_ACCESS_TOKEN/H3_INSTANCE_PASSWORD instead")
    config = {"root": str(root), "url": url, "turbo": args.turbo,
              "checkpoint": args.checkpoint, "hybrid": args.hybrid, "update_policy": args.update_policy,
              "bind": args.bind, "environment_id": environment_identity(),
              "refine": not args.no_refine, "controlnet": not args.no_controlnet,
              "qwen": args.qwen_image_profiles, "source_version": source_version()}
    # Root-level lock prevents concurrent launchers with different --state-dir values.
    with InstallLock(root / ".h3-launcher.lock"):
        directory.mkdir(parents=True, exist_ok=True)
        state = load_state(directory / "state.json", config)
        if not (root / "main.py").is_file():
            state["fresh_install"] = True
            atomic_json(root / ".h3-launcher-owned.json", {"version": VERSION, "fresh_install": True, "config": {"root": str(root)}})
        runner = Runner(directory)
        def save(_state=None):
            state["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
            atomic_json(directory / "state.json", state)
            atomic_json(directory / "report.json", state)
        def stage(name, action):
            state["stage"] = name
            state["status"] = "running"
            save()
            runner.emit("H3 LAUNCHER: " + name)
            result = action()
            state["stages"][name] = {"completed_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            save()
            return result
        try:
            # Cached success flags never substitute for current validation.
            state.update(files_prepared=False, api_ready=False, gpu_validated=False,
                         gpu_validation_scope='original_baseline_only',
                         optional_profiles_gpu_validated=False)
            stage("prerequisites", lambda: prerequisites(runner))
            api = ComfyAPI(url)
            # A saved costly job is followed first, never rebooted or resubmitted.
            if state["smoke"].get("status") in ("submitting", "submission_uncertain", "running", "timeout", "downloaded"):
                result = stage("resume_smoke", lambda: run_smoke(api, PROJECT, directory, state, save, args.smoke_timeout))
                if result.get("status") != "validated":
                    raise RuntimeError("Saved smoke job: " + result.get("status", "unknown") + "; it was not cancelled or resubmitted")
                state["gpu_validated"] = True
            stage("wait_for_idle", lambda: wait_for_install_idle(api, args.queue_timeout))
            stage("protect_user_edits", lambda: protect_runtime_edits(root))
            # Runtime repairs are idempotent; snapshot once per source/config instead of every retry.
            if not state.get("snapshot"):
                state["snapshot"] = stage("backup", lambda: runtime_snapshot(root, directory))
            python = stage("source", lambda: prepare_source(root, python, runner))
            needs_runtime = (not runtime_matches(root) or "runtime" not in state["stages"]
                             or not environment_ready(python, args) or not optional_nodes_ready(root, args))
            state["runtime_changed"] = needs_runtime or state.get("restart_pending", False)
            stage("wait_before_runtime", lambda: wait_for_install_idle(api, args.queue_timeout))
            def mark_reload():
                if state.get("restart_pending"):
                    return
                state["restart_pending"] = True
                try:
                    current = api.request("/h3_studio/readiness")
                    state["pre_update_instance"] = current.get("runtime_instance") if isinstance(current, dict) else None
                except (OSError, RuntimeError):
                    state["pre_update_instance"] = None
                save()
            if needs_runtime:
                mark_reload()
                python = stage("runtime", lambda: setup_runtime(args, root, python, runner))
            else:
                runner.emit("Runtime source and Python imports unchanged; reusing installation.")
            if args.hybrid:
                def prepare_hybrid():
                    item = json.loads((PROJECT/'deploy/compatibility.json').read_text(encoding='utf-8'))['optional_nodes']['hybrid']
                    path = root/'custom_nodes'/item['directory']
                    if not path.exists():
                        mark_reload()
                        runner.run(['git','clone',item['repository'],path])
                        runner.run(['git','-C',path,'checkout',item['commit']])
                    else:
                        revision = subprocess.check_output(['git','-C',str(path),'rev-parse','HEAD'],text=True).strip()
                        origin = subprocess.check_output(['git','-C',str(path),'remote','get-url','origin'],text=True).strip()
                        dirty = subprocess.check_output(['git','-C',str(path),'status','--porcelain'],text=True).strip()
                        if revision != item['commit'] or origin != item['repository'] or dirty:
                            raise RuntimeError('Hybrid checkout differs from the audited pin; preserve local edits and resolve it before launch.')
                stage('optional_hybrid', prepare_hybrid)
            def runtime_audit():
                report = audit_environment(python)
                state['environment'] = report
                save()
                if not report['ready']:
                    raise RuntimeError('; '.join(report['issues']))
            stage('environment_audit', runtime_audit)
            def patch_runtime():
                if __package__:
                    from .runtime_patches import apply_patches
                else:
                    from runtime_patches import apply_patches
                changed = apply_patches(root)
                if changed:
                    mark_reload()
                return changed
            state["runtime_changed"] = stage("runtime_patches", patch_runtime) or state["runtime_changed"]
            overlay_changed = stage("model_paths", lambda: configure_overlay(root, overlay, python, before_change=mark_reload))
            state["runtime_changed"] = state["runtime_changed"] or overlay_changed
            state["models"] = stage("models", lambda: prepare_models(root, roots, artifacts, directory, emit=runner.emit))
            state["files_prepared"] = True
            write_source_receipt(root)
            save()
            if args.no_start:
                state.update(status="files_prepared", next_action="Start ComfyUI, then rerun without --no-start")
                save()
                runner.emit("Files prepared. API and GPU validation were not run.")
                return 0
            stage("start", lambda: start_server(api, root, python, args, runner, state, save))
            env = dict(os.environ, H3_ACCESS_TOKEN=os.environ.get("H3_ACCESS_TOKEN", ""), QWEN_IMAGE_PROFILES=args.qwen_image_profiles)
            stage("api_verification", lambda: runner.run([python, PROJECT / "deploy/verify_h3_server.py", "--url", url], env=env, retries=0))
            state["api_ready"] = True
            if not args.skip_smoke:
                result = stage("smoke", lambda: run_smoke(api, PROJECT, directory, state, save, args.smoke_timeout))
                if result.get("status") != "validated":
                    raise RuntimeError("Smoke validation status: " + result.get("status", "unknown") + "; rerun to follow the same job")
                state["gpu_validated"] = True
            state.update(status="ready" if state["gpu_validated"] else "api_ready",
                         studio_url=url.rstrip("/") + "/extensions/" + runtime_target(root).name + "/index.html", next_action=None)
            save()
            runner.emit("H3 ready: " + state["studio_url"])
            if __package__:
                from .ui_update import complete_recovery
            else:
                from ui_update import complete_recovery
            complete_recovery(root, state)
            runner.emit("GPU video/audio validation: " + ("passed" if state["gpu_validated"] else "not run"))
            runner.emit("Report: " + str(directory / "report.json"))
            return 0
        except (Exception, KeyboardInterrupt) as error:
            state.update(status="needs_action", error=redact(error), next_action="Rerun the same command after resolving the reported error; verified downloads and the smoke prompt ID are retained.")
            save()
            runner.emit("H3 needs action: " + redact(error))
            runner.emit("Report: " + str(directory / "report.json"))
            return 1


def source_version():
    files = [PROJECT / name for name in runtime_files()]
    files += [PROJECT / "install.sh", PROJECT / "deploy/install_windows.py", PROJECT / "deploy/v2_runtime_files.txt"]
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.read_bytes())
    return digest.hexdigest()


def environment_identity():
    import socket
    identity = {"hostname": socket.gethostname(), "gpu": "unavailable"}
    executable = shutil.which("nvidia-smi")
    if executable:
        result = subprocess.run([executable, "--query-gpu=uuid,driver_version", "--format=csv,noheader"],
                                capture_output=True, text=True)
        if result.returncode == 0:
            identity["gpu"] = result.stdout.strip()
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print("H3_LAUNCHER_ERROR:", redact(error), file=sys.stderr)
        raise SystemExit(1)
