# The Great Stink — where the work stands

## Delivered film (artifact `final`, run 42541625533)
1440x2560, 1877 frames, 62.5667 s, audio present. `out/video.mp4` + `out/gate.txt`.
Local silent master: `/tmp/sv/video_silent.mp4` (video stream identical to the muxed final).

## The gate FAILED, and the job lied about it
`qa-gate: FAILED 1 failed, 7 passed` / `gate exit: 1` — yet the job concluded **success**.
Cause: `bash qa-gate.sh ... | tee out/gate.txt` replaces the step's status with `tee`'s.
**Fixed** (commit on master): capture `${PIPESTATUS[0]}`, echo it, `exit $RC`. Verified both ways
with a stub gate: failing -> step exit 1, passing -> 0.

## The five "pop" frames — fully diagnosed
Reproduced locally on `/tmp/sv/video_silent.mp4` (deterministic, no randomness in the render path).
The QA metric is a whole-frame mean abs diff, so a camera shake over a grazing plane reads huge.

| frame | diff / median | verdict |
|---|---|---|
| 601 | 9.99 / 0.82 (12.2x) | **REAL one-frame artifact.** Foreground terrace floor replaced by cream/tan banding for exactly one frame. Shot 6, camera essentially static (z 30.25 -> 30.26). Chunk 5 (590-706) rendered in ONE 200-min pass, no bisect, so it is not a splice. Nearest-frame search: frame 601 matches no other frame in the film — unique corruption. |
| 602 | 9.77 / 0.80 | Same defect, second edge: frame 602 is normal, so the gate reports the two transitions in and out of the bad frame. |
| 1454 | 4.11 / 0.51 | **Planned.** `KICKS[48.41]` impact shake; 60 % of the diff is explained by a pure global shift. |
| 1455 | 3.57 / 0.49 | Same kick, next frame (sign flips every frame by design). |
| 1840 | 50.57 / 10.53 (4.8x) | **Planned.** `KICKS[61.28]` on the fastest frame of the S14b crane-out. Camera displacement is only ~1.5 px (projected), but the near ground is grazing, so it sweeps a large area. The sky band shows NO anomaly (5.69 vs 4.91/5.24 neighbours), which rules out a render glitch. |

So the gate has exactly **one real defect** (frame 601) and two false positives caused by the
planned impact kicks not being declared to it.

## Open work
1. Decide frame 601: fix and re-render chunk 5, or accept.
   Test in flight: `stills.yml` run 42545166833 renders frames 599-603 at scale 0.6 — if 601 is
   clean as an isolated still, the artifact needs in-sequence context (concurrency 1 in the chunk
   render), and only a range re-render can reproduce it.
2. Teach `shots.json` about the kicks so the gate stops calling designed shakes glitches
   (`KICKS` in story.ts is currently NOT exported; `emit-shots.mjs` would need it).
3. Re-run the gate to a genuine PASS.
4. **Download the `final` artifact BEFORE deleting the repo** — deleting the repo destroys every
   Actions artifact, including the only copy of `out/video.mp4`.
5. Delete the public repo `antiviruslol518-cpu/stink-ci` when finished (standing instruction).

## Constraints
- Never render or process on this PC (1 GB free RAM; /tmp is a 3.6 GB tmpfs at 90 %).
  Decoding 1877 frames at 180x320 into `~/qa-scratch` is fine (310 MB on /home); a full-size
  render is not.
- Never upload the skill's private `references/` directory.
