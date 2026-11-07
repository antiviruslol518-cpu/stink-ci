#!/usr/bin/env bash
# plan-chunks.sh — split a frame range into N contiguous chunks, one per CI job.
#
# Chunks MUST be contiguous and MUST cover every frame exactly once: a gap is a missing
# beat, an overlap is a stutter, and neither shows up until the gate sees the duration.
# Remotion's frameRange is inclusive on both ends, so each chunk's end is the next
# chunk's start minus one.
#
# Usage: bash tools/plan-chunks.sh <totalFrames> <chunks>   ->  prints "index start end" lines
set -euo pipefail
TOTAL="${1:?usage: plan-chunks.sh <totalFrames> <chunks>}"
N="${2:?}"
[ "$TOTAL" -gt 0 ] || { echo "plan-chunks: total must be > 0"; exit 1; }
[ "$N" -gt 0 ] || { echo "plan-chunks: chunks must be > 0"; exit 1; }
[ "$N" -le "$TOTAL" ] || { echo "plan-chunks: more chunks ($N) than frames ($TOTAL)"; exit 1; }

BASE=$((TOTAL / N))
REM=$((TOTAL % N))
start=0
for ((i = 0; i < N; i++)); do
  size=$BASE
  # spread the remainder over the first chunks so no chunk is much bigger than another
  if [ "$i" -lt "$REM" ]; then size=$((size + 1)); fi
  end=$((start + size - 1))
  echo "$i $start $end"
  start=$((end + 1))
done
