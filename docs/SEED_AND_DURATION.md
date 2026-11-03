# Seed and duration

Seed controls initial noise, not quality. Default 42 is reproducible; fractional values are invalid. Blank or -1 chooses one random uint64 before submission, then displays/saves the actual value. Invalid old drafts are repaired visibly.

The exact range is 0–18446744073709551615. Values above JavaScript integer precision remain exact strings until backend conversion. Refinement increments wrap to zero at the maximum. H3 and Qwen share these rules. The same seed does not fix results when model, canvas, prompt, inputs or arithmetic change.

Duration 0.2–15.1 seconds snaps to 5+17k frames at 24 fps, maximum 362. Examples: 3s →73 frames ≈3.042s; 1s →22 frames ≈0.917s; minimum 5 frames ≈0.208s. Below 124 frames is outside the usual trained range; node support does not establish motion/audio quality.

Video/audio reference trims still require 2–15 seconds per file. Continuation retains 39 context frames, so targets must exceed that context; first valid target is 56 frames. Tests cover exact/random seeds, old drafts, duration snapping and graph capture without new GPU output. [Compatibility](COMPATIBILITY_MATRIX.md).
