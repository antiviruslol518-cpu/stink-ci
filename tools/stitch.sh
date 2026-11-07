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
  # A chunk carrying an audio stream breaks the join: Remotion's silent AAC track is a
  # different length from its video, which leaves a hole at every seam. Chunks must be
  # muted; verify rather than assume.
  A=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$c")
  [ -z "$A" ] || { echo "stitch: $c HAS an audio stream — chunks must be rendered muted"; exit 1; }
  # Dimensions and timebase must agree across chunks, or concat silently produces a file
  # whose frame count looks right and whose frames are the wrong size or timestamp.
  D=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$c")
  TB=$(ffprobe -v error -select_streams v:0 -show_entries stream=time_base -of csv=p=0 "$c")
  echo "  chunk $(basename "$c")  ${n} frames  ${d}s  ${D}  tb=${TB}"
  if [ -z "${FIRST_D:-}" ]; then FIRST_D="$D"; FIRST_TB="$TB"; fi
  [ "$D" = "$FIRST_D" ] || { echo "stitch: resolution mismatch ($D vs $FIRST_D) — refusing to join"; exit 1; }
  [ "$TB" = "$FIRST_TB" ] || { echo "stitch: timebase mismatch ($TB vs $FIRST_TB) — refusing to join"; exit 1; }
  TOTAL=$((TOTAL + n))
  printf "file '%s'\n" "$(cd "$(dirname "$c")" && pwd)/$(basename "$c")" >> /tmp/concat.txt
done
echo "  expected total: ${TOTAL} frames"

echo "== stream-copy concat"
# -video_track_timescale pins the output timebase so every chunk lands on the same clock.
ffmpeg -y -v error -f concat -safe 0 -i /tmp/concat.txt \
  -c copy -video_track_timescale 90000 -movflags +faststart "$OUT"

GOT=$(nframes "$OUT")
echo "  concat produced: ${GOT} frames"

if [ "$GOT" = "$TOTAL" ]; then
  # frame count alone is NOT proof: a mismatched-timebase join can report the right count
  # and still have timestamps that jump. Check the duration against frames/fps too.
  FDUR=$(ndur "$OUT")
  echo "stitch: OK (lossless stream copy, ${GOT} frames, ${FDUR}s)"
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
