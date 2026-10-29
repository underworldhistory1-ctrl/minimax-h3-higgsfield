# Direct scene workspace

The editor opens without requiring a manually created project. A new scene is a tab-local working setup; Save/Generate creates its own named server workspace only when needed. The top Save scene to picker explicitly copies the current setup into a new scene/shot in a selected existing project, leaving existing project drafts, takes and source project intact. Browse/Open project remains navigation and restores that project's work.

Keep output ownership, revision checks and immutable history. Clear setup resets the current working shot and tab checkpoint; it neither deletes server media nor leaves scene canvas/sampling/reference/audio flags from the old setup. Download is visible on result cards. Search filters saved generations using recorded filenames, prompts, model/settings with all-word matching.

Verification must exercise fresh startup, auto workspace creation, assignment with references, retry after a lost response, clear/reload, selecting another project without overwriting it, direct downloads and desktop/mobile layout. Server restart/deployment only after proving its queue idle.


## Verification

- 248 JavaScript tests, including lost assignment acknowledgement with failed read-back, and pending unassigned autosave settlement.
- 32 project workspace/scene Python tests, including invalid reference groups, unavailable media and continuation ownership rejection.
- Browser acceptance against temporary real local project/asset APIs: fresh startup, Save and Generate automatic workspace creation, scene assignment with original media, source draft preservation, reload, Clear/reload, scoped all-word search and direct card Download, desktop/mobile overflow.
- Existing project workspace, Elements and Scenes browser journeys passed. Scenes API Reuse acceptance explicitly applies the returned server draft; ordinary refresh still preserves unsaved tab edits. Offline reference acceptance clears the original-byte cache before simulating a download failure.
- Browser render submission was intercepted before inference. These checks validate interaction and persistence; they do not establish GPU output quality.

- Startup restoration waits for all workspace scripts at DOMContentLoaded, preventing cached-load dependency races. Explicit page hashes are retained for independent workspaces too.
