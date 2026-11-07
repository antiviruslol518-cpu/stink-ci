#!/usr/bin/env bash
# render-chunk.sh — render one frame range, and SURVIVE the thing that actually happens.
#
# Software WebGL (swangle) is fragile: under memory pressure the browser page crashes and
# @remotion/renderer throws "Page crashed!". That is not a logic error — it is a bad
# minute. Rerunning the same chunk from the same start frame usually succeeds.
#
# So: retry the whole chunk up to N times, and if a chunk keeps dying, split it in half
# and render the halves separately. A 300-frame chunk that dies at frame 250 does not
# have to lose the first 250 frames' worth of wall-clock if we bisect.
#
# Usage: render-chunk.sh <out.mp4> <start> <end> [scale] [crf] [conc]
set -uo pipefail

OUT="${1:?usage: render-chunk.sh <out.mp4> <start> <end> [scale] [crf] [conc]}"
START="${2:?}"
END="${3:?}"
SCALE="${4:-0.4}"
CRF="${5:-24}"
CONC="${6:-1}"

TRIES="${CHUNK_TRIES:-3}"
mkdir -p "$(dirname "$OUT")"

render_once() {
  local a="$1" b="$2" o="$3"
  echo "== rendering frames $a-$b -> $o"
  node tools/render.mjs "$o" "$a" "$b" "$SCALE" "$CRF" "$CONC"
}

attempt=0
while [ "$attempt" -lt "$TRIES" ]; do
  attempt=$((attempt + 1))
  echo "-- attempt $attempt/$TRIES"
  if render_once "$START" "$END" "$OUT"; then
    echo "OK: $OUT ($START-$END)"
    exit 0
  fi
  echo "!! chunk $START-$END failed on attempt $attempt"
  rm -f "$OUT"
done

# Repeated failure: bisect. Halves are independent and each can itself be retried.
SPAN=$((END - START + 1))
if [ "$SPAN" -lt 30 ]; then
  echo "FAILED: $START-$END ($SPAN frames) will not render. Not bisecting further."
  exit 1
fi
MID=$((START + SPAN / 2))
echo "bisecting $START-$END into $START-$((MID - 1)) and $MID-$END"
A="${OUT%.mp4}_a.mp4"
B="${OUT%.mp4}_b.mp4"
render_once_retry() {
  local a="$1" b="$2" o="$3" n=0
  while [ "$n" -lt "$TRIES" ]; do
    n=$((n + 1))
    if render_once "$a" "$b" "$o"; then return 0; fi
    rm -f "$o"
  done
  return 1
}
render_once_retry "$START" "$((MID - 1))" "$A" || { echo "FAILED: first half"; exit 1; }
render_once_retry "$MID" "$END" "$B" || { echo "FAILED: second half"; exit 1; }

# Join the two halves into the chunk file so downstream steps see one file.
bash tools/stitch.sh "$OUT" "$A" "$B" || exit 1
rm -f "$A" "$B"
echo "OK (bisected): $OUT ($START-$END)"
