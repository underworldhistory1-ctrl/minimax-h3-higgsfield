# Provenance and installer transparency

H3 Interface is maintained by underworldhistory1-ctrl and contributors. It develops a browser workspace, selection contracts, project persistence, preparation, deployment and verification on top of existing open-source systems.

The original H3 Studio foundation comes from [CharlesMod/h3-studio](https://github.com/CharlesMod/h3-studio). The original copyright and MIT permission notice remain in [LICENSE](../LICENSE). Repository history records subsequent contributions. This project does not own MiniMax, Qwen, ComfyUI or external node packs. Their names identify compatibility; their models and licenses remain separate.

## Read before installation

Review [install.ps1](../install.ps1), [install.sh](../install.sh), [Windows implementation](../deploy/install_windows.py), [Linux implementation](../deploy/bootstrap_h3_server.sh), [launcher](../deploy/launcher.py), [extension entry point](../__init__.py) and [prompt provider](../promptwriter.py). Installing executes Python, shell and dependency code under your account.

Windows scripts do not self-elevate or bypass ExecutionPolicy. Missing prerequisites can be installed through winget, accepting package/source agreements. Linux can install missing tools through apt-get when running as root or through available noninteractive sudo. Prefer a dedicated environment and account. Running the whole launcher as root also runs downloaded software as root.

The installer writes runtime copies, dependencies, models, workflows, model path configuration, backups and explicit compatibility patches for ComfyUI core/navigation and optional MotionCache. It can start or restart an idle server and submit a default smoke test unless `--skip-smoke` is selected. It preserves unknown local source edits. Optional nodes are checked against pinned revisions and unknown tracked edits or untracked executable files are rejected, including at the expected HEAD; only the exact managed MotionCache patch is recognized.

## Update policy and supply chain

The default `latest` policy fetches official main and executes the updated launcher. This means the next launch can execute newer code than the version you previously reviewed. Use `--no-update` to prevent fetching; `notify` retains checked-out source; `verified` accepts only manifest-approved commits. The approved list is currently empty, so verified does not automatically advance.

Pinned model revisions, expected sizes and SHA-256 checks protect model preparation; Git pins identify optional source versions. These are not a complete reproducible supply-chain lock: pip dependencies and their transitives are not all hash-locked. Review [compatibility pins](../deploy/compatibility.json) and [current model manifest](../deploy/launcher_models.py).

## Network and provider boundaries

The default bind is `127.0.0.1`. Public binding does not add an application login: restrict access through ComfyUI, your provider, firewall or authenticated proxy. Do not publish private workspace URLs as a project website.

Generation does not require a commercial API key. Local automatic preparation follows deterministic rules; optional AI prompt preparation needs a configured local or remote model. External providers with API keys require HTTPS outside loopback; provider redirects cannot downgrade HTTPS and cross-origin redirects drop Authorization. No credentials belong in repository files or issue reports.

## Public discovery

The public website contains documentation only. Its HTML allows indexing and includes a canonical URL, structured metadata and a sitemap. GitHub controls its own repository-page indexing. Search engines decide whether and when to index content; sitemap availability does not guarantee discovery, ranking or inclusion. Search Console submission requires a verified property owner.

## Verification limits

Read source tests, browser checks and GPU evidence separately. Passing checks does not prove absence of every bug or guarantee visual quality. Current reference and installer changes require fresh GPU validation on the target hardware before claiming rendering performance or output quality.
