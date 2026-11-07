#!/usr/bin/env bash
# stitch.sh — join rendered chunks into one frame-accurate silent video.
#
# Why this exists: the film is rendered in parallel chunks (one GitHub Actions job each)
# so a 2000-frame 2K render finishes in wall-clock minutes-per-chunk rather than hours
# in a single 6-hour-capped job. Chunks are encoded with IDENTICAL settings, so a
# stream-copy concat is lossless. But stream-copy concat is exactly the thing that
# silently produces a broken file if the chunks disagree, so this script PROVES the
# result: it compares the concatenated frame count against the sum of the parts and
# falls back to a re-encode if they differ.
#
# Usage: bash tools/stitch.sh <out.mp4> <chunk1.mp4> <chunk2.mp4> ...
set -euo pipefail

OUT="${1:?usage: stitch.sh <out.mp4> <chunk1.mp4> ...}"
shift
[ "$#" -ge 1 ] || { echo "stitch: no chunks"; exit 1; }

nframes() { ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$1"; }
ndur()    { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

TOTAL=0
: > /tmp/concat.txt
for c in "$@"; do
  [ -f "$c" ] || { echo "stitch: missing chunk $c"; exit 1; }
  n=$(nframes "$c")
  d=$(ndur "$c")
  echo "  chunk $(basename "$c")  ${n} frames  ${d}s"
  TOTAL=$((TOTAL + n))
  # concat demuxer needs an absolute path and single-quoted escaping
  printf "file '%s'\n" "$(cd "$(dirname "$c")" && pwd)/$(basename "$c")" >> /tmp/concat.txt
done
echo "  expected total: ${TOTAL} frames"

echo "== stream-copy concat"
ffmpeg -y -v error -f concat -safe 0 -i /tmp/concat.txt -c copy -movflags +faststart "$OUT"

GOT=$(nframes "$OUT")
echo "  concat produced: ${GOT} frames"

if [ "$GOT" = "$TOTAL" ]; then
  echo "stitch: OK (lossless stream copy, ${GOT} frames)"
  exit 0
fi

# A mismatch means the chunks' encoder settings or timebases disagreed. Re-encoding is
# slower but always correct, and losing a little quality beats shipping a video whose
# middle is missing or whose audio drifts.
echo "stitch: WARN frame count ${GOT} != ${TOTAL} — re-encoding"
ffmpeg -y -v error -f concat -safe 0 -i /tmp/concat.txt \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "$OUT"
GOT=$(nframes "$OUT")
if [ "$GOT" = "$TOTAL" ]; then
  echo "stitch: OK after re-encode (${GOT} frames)"
else
  echo "stitch: FAILED — re-encode produced ${GOT}, expected ${TOTAL}"
  exit 1
fi
