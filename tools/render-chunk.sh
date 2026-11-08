#!/usr/bin/env bash
# render-chunk.sh — render one frame range, and SURVIVE the thing that actually happens.
#
# Software WebGL (swangle) is fragile: under memory pressure the browser page crashes and
# @remotion/renderer throws "Page crashed!". That is not a logic error — it is a bad
# minute. Rendering a smaller range usually succeeds.
#
# THE TRAP THIS SCRIPT EXISTS TO AVOID: a retry of the WHOLE range does not fit in the job
# timeout. At ~82 s/frame a 118-frame chunk is ~161 min per attempt, so two attempts (322
# min) nearly exhausts a 350-minute job and the third is guaranteed to be killed mid-render
# — which is exactly how chunks 0 and 9 died: deterministic failure, three retries, no
# time left to bisect, artifact empty.
#
# So the order is: try the whole range ONCE. If it fails, BISECT immediately rather than
# retrying the same size — a half is half the wall-clock and can itself be retried. Only
# ranges below BISECT_MIN are worth retrying at the same size.
#
# Usage: render-chunk.sh <out.mp4> <start> <end> [scale] [crf] [conc]
#   CHUNK_TRIES   attempts per range before bisecting (default 3)
#   BISECT_MIN    below this many frames, retry instead of bisecting (default 30)
set -uo pipefail

OUT="${1:?usage: render-chunk.sh <out.mp4> <start> <end> [scale] [crf] [conc]}"
START="${2:?}"
END="${3:?}"
SCALE="${4:-0.4}"
CRF="${5:-24}"
CONC="${6:-1}"

TRIES="${CHUNK_TRIES:-3}"
BISECT_MIN="${BISECT_MIN:-30}"
mkdir -p "$(dirname "$OUT")"

render_once() {
  local a="$1" b="$2" o="$3"
  echo "== rendering frames $a-$b -> $o"
  node tools/render.mjs "$o" "$a" "$b" "$SCALE" "$CRF" "$CONC"
}

# Render [a,b] into o, bisecting on failure. Returns 0 only if o exists and is complete.
render_range() {
  local a="$1" b="$2" o="$3" depth="${4:-0}"
  local span=$((b - a + 1))
  local pad; pad=$(printf '%*s' "$depth" '')

  # Below the bisect floor there is nothing smaller to fall back to: retry at this size.
  local tries=1
  if [ "$span" -lt "$BISECT_MIN" ]; then tries="$TRIES"; fi

  local n=0
  while [ "$n" -lt "$tries" ]; do
    n=$((n + 1))
    echo "${pad}-- [$a-$b] ($span frames) attempt $n/$tries"
    if render_once "$a" "$b" "$o"; then
      echo "${pad}   OK [$a-$b]"
      return 0
    fi
    rm -f "$o"
    echo "${pad}   !! [$a-$b] failed on attempt $n"
  done

  # A single attempt on a large range failed. Retrying the same size will very likely fail
  # the same way AND may not fit in the remaining job time — split it instead.
  if [ "$span" -lt 2 ]; then
    echo "${pad}   FAILED: frame $a will not render"
    return 1
  fi
  local mid=$((a + span / 2))
  echo "${pad}   bisecting [$a-$b] -> [$a-$((mid - 1))] + [$mid-$b]"
  local A="${o%.mp4}_a.mp4" B="${o%.mp4}_b.mp4"
  render_range "$a" "$((mid - 1))" "$A" $((depth + 1)) || { echo "${pad}   FAILED: first half"; return 1; }
  render_range "$mid" "$b" "$B" $((depth + 1)) || { echo "${pad}   FAILED: second half"; return 1; }

  # Join the halves so downstream steps see one file.
  bash tools/stitch.sh "$o" "$A" "$B" || { echo "${pad}   FAILED: joining halves"; return 1; }
  rm -f "$A" "$B"
  echo "${pad}   OK (bisected) [$a-$b]"
  return 0
}

if render_range "$START" "$END" "$OUT"; then
  echo "OK: $OUT ($START-$END)"
  exit 0
fi
echo "FAILED: $START-$END could not be rendered"
exit 1
