# Modernization audit — 2026-10-13

Historical source/CPU/browser review separating Original, Singularity, Hybrid conditioning and Hybrid loader; adding schema-driven sampling/precision/acceleration; persisting Refine settings; gating reference ControlNet; improving batch inputs/layout and continuation signatures.

Turbo retirement and provisional update policies in the original audit are superseded by current Turbo/Pika support and official-main updates. This dated report is not installation instructions. Original detailed history remains in Git.

Checks covered graph routing, live scalar schemas, reference order, hybrid signatures, download integrity and old projects. No new GPU inference occurred in that audit. Later Singularity evidence is in [the October 15 report](PRODUCTION_READINESS_2026_10_15.md). LiseTY's dedicated Anime → Realism adapter was initially omitted and added in 2.5.2.

ControlNet plus continuation/refinement/audio enhancement remains unsupported. Static masks do not track objects. Hybrid/unknown LoRA quality remains experimental. [Compatibility](COMPATIBILITY_MATRIX.md) · [Original test record](MODERNIZATION_TEST_RESULTS.json).
