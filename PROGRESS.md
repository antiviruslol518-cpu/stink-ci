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

## Frame 601: ROOT CAUSE FOUND — `face()` transposed its UV spans
Not a render glitch, not the post chain, not the shadow map, not the cast, not the camera.

Measured on the delivered film (596-606): the **wall is bit-identical** between 600 and 601
(zero-shift NCC +0.997) while the **near floor** is uncorrelated (-0.26) and becomes measurably
SHARPER (hf 0.85 -> 1.22) and BRIGHTER (188 -> 199), then snaps back on 602. Exactly one frame
out of the 147 in shot 6.

Cause: `quad()` binds `u` to the a->b edge and `v` to the a->d edge. `face()` reverses the winding
to `quad(a, d, c, b, ...)` when the normal points away, which swaps which world edge carries each
axis -- but it passed the caller's `u1, v1` through unchanged. The spans were computed for a->b /
a->d, so on every flipped face they were transposed:

| face | before | after |
|---|---|---|
| terrace floor | u 0.267 m/uv, v 60 m/uv -> **225:1** | 4.000 / 4.000 |
| farbank wall | u 0.062 m/uv, v 260 m/uv -> **4225:1** | 4.000 / 4.000 |
| embankment wall | already 1:1 (not flipped) | unchanged |
| farbank floor | already 1:1 (not flipped) | unchanged |

A ~225:1 minification stretch is what put the sampler in the regime where one frame resolved to a
different mip and snapped back. The wall was untouched because its face is not flipped.

Confirmed by raycast: at the artefact rows the floor's `uv.y` is exactly **1.50000** on every row
of every frame -- `(0-(-90))/510*8.5` -- while `u` tracks the camera. The earlier "UV fix" claimed
1:1 but was checked with a raycast that cannot see an axis swap.

**Fixed** (commit `942e69c`): the flipped branch now passes `(v1, u1)`.

## Frame 601, part 2: the seam follows the floor's TRIANGLE DIAGONAL
The UV fix corrected the floor's density but did **not** remove the artifact. Bisecting the
post chain on the fixed geometry showed the characters' skirts clipped at the same row in
**every** variant — `all`, `no-ink`, `no-lens`, `no-bloom`, `no-grade`, `no-post`,
`no-shadows`, `aniso1`, `aniso16`, `nomip`. So it is not the post chain.

What it actually is: frame 601 draws a hard line at row ~925 that tracks the **triangle
diagonal of the terrace floor quad**:

| screen x | diagonal (projected) | observed line |
|---|---|---|
| 120 | 924.8 | 924 |
| 320 | 930.0 | 929 |
| 560 | 936.3 | 935 |

Slope 0.0271 (observed) vs 0.0260 (diagonal), constant ~1 px offset across the full width.
Everything on the near side of that diagonal is drawn at a different texture LOD from
everything beyond it — vertical HF above/below the diagonal is 8.4/9.9 on frame 600 but
9.8/4.5 on 601 (2.16x). The terrace floor was ONE 510 m x 34 m quad, i.e. **two triangles**
with vertices far outside the frustum, so every per-vertex value is interpolated across a
500 m span. It is a per-triangle interpolation defect, which is why sub-pixel motion flips it
on exactly one frame of a 147-frame shot.

**Fixed** (commit `5293261`): `faceGrid()` subdivides a face into an nu x nv grid; applied to
the terrace floor, embankment wall, and both far-bank faces. Verified the resulting uv map is
exactly affine over the whole face (max residual 1e-14) at 4.000 m/uv on both axes, and the
longest triangle edge drops from ~500 m to 32 m.

Two checks that the fix cannot change how anything *looks*:
- sampled the new grid against the previous `face()` output at 11 world points across the
  floor: identical to 7e-15 (including both flipped and unflipped cases);
- the whole set is still only 18.6 k vertices and Batch merges one mesh per material, so the
  draw-call count is unchanged.

## Open work
1. ~~Decide frame 601~~ — fixed; needs a full re-render (every shot sees the terrace floor).
2. ~~Teach `shots.json` about the kicks~~ — done in `ce54c39`, which postdates the delivered
   render, so 1454/1455/1840 will not recur.
3. Re-render all 16 chunks and re-run the gate to a genuine PASS.
4. **Download the `final` artifact BEFORE deleting the repo** — deleting the repo destroys every
   Actions artifact, including the only copy of `out/video.mp4`. Already saved to
   `~/qa-scratch/final/`.
5. Delete the public repo `antiviruslol518-cpu/stink-ci` when finished (standing instruction).

## Constraints
- Never render or process on this PC (1 GB free RAM; /tmp is a 3.6 GB tmpfs at 90 %).
  Decoding 1877 frames at 180x320 into `~/qa-scratch` is fine (310 MB on /home); a full-size
  render is not.
- Never upload the skill's private `references/` directory.
