# H3 Higgsfield documentation

Current release: **2.5.6**. The main [README](../README.md) introduces the studio;
[CHANGELOG](../CHANGELOG.md) records release history. “H3 Studio” is the workspace
name used in controls and historical guides; “V2” describes the earlier migration,
not a separate current product release.

| Task | Guide |
| --- | --- |
| Install on Windows or NVIDIA Linux | [Installation](INSTALL.md) |
| Update, reuse weights or inspect readiness | [Automatic launcher](LAUNCHER.md) |
| Understand model and method names | [Compatibility matrix](COMPATIBILITY_MATRIX_AR.md) |
| Learn the video/image workflow | [Studio workflow](UX_FLOW.md) · [Graph contract](GRAPH_MAP.md) |
| Save projects, assets and takes | [Projects](PROJECT_WORKSPACE_AR.md) · [Organization and Reuse](ORGANIZATION_AND_REUSE_AR.md) |
| Recover after a worker restart | [Render recovery](RENDER_RECOVERY.md) · [Tracked decode recovery](DECODE_RECOVERY.md) |
| Upgrade an older V2 install or roll back | [Upgrade guide](V2_UPGRADE_AR.md) |
| Check what was actually verified | [Current audit](PRODUCTION_READINESS_2026_10_15.md) · [Evidence history](VERIFIED_BEHAVIOR.md) |
| Provider-specific deployment | [OpenBayes](OPENBAYES.md) · [Legacy Salad image](../deploy/SALAD_DEPLOYMENT.md) |
| Review the published example | [Superman reference walkthrough](demo/superman/README.md) |

Dated reports and older version headings describe the checks performed at that
time. Consult the current audit before treating an old limitation or test count
as the current status. Screenshots and public demos are examples, not a promise
of quality for every prompt or adapter combination.
