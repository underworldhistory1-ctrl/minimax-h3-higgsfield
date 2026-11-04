# H3 Interface 2.12.0

Released 4 November 2026. Adds explicit storyboard sequence and spatial planning reference guidance, using the existing native reference graph.

- Spatial plan is a new optional experimental image role. It binds to Picture, leaves character Subject numbering intact and adds instructions to use requested layout/routes without rendering the diagram, aerial viewpoint, annotations or drawing style. No calibrated camera trajectory is inferred.
- Storyboards offer Follow the prompt, One continuous take and Separate shots. The choice reaches guided compilation, draft/project restoration, saved output settings, local preparation manifests and cache identity. Complete native prompts remain authoritative.
- Both roles keep independent native image-reference inputs. A board/map is never automatically inserted as a first frame or AddGuide. Output duration and canvas remain actual interface settings; printed annotations do not change them.
- Native compilation needs no API key. Optional local preparation receives the new role/sequence metadata when configured; no new model, inference library or external camera pack is installed.

Validation: 595 Python tests (594 pass, one platform skip), 304 JavaScript tests, independent Python/JS code reviews, and a real local browser with actual upload/project/graph routes and simulated inference. The browser checks selectors, sequence metadata, project save/reload, three independent reference images, ReferenceToVideo routing, no automatic guide/first-frame insertion and cancellation. No new GPU rendering, camera adherence or perceptual quality claim.

See [storyboards, spatial plans and timed images](STORYBOARD_AND_SPATIAL_PLANS.md) for recommendations, native input boundaries and primary sources. Runtime and model pins remain unchanged.
