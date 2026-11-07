#!/usr/bin/env bash
# mux.sh — put the mix on the silent video, and report what the result actually is.
# Usage: bash tools/mux.sh <silent.mp4> <mix.wav> <out.mp4>
set -euo pipefail
V="${1:?usage: mux.sh <silent.mp4> <mix.wav> <out.mp4>}"
A="${2:?}"
O="${3:?}"

[ -f "$V" ] || { echo "mux: no video $V"; exit 1; }
[ -f "$A" ] || { echo "mux: no audio $A"; exit 1; }

# -c:v copy keeps the render bit-exact; only the audio is encoded.
# -shortest would truncate to the audio, so instead we let the video define the length
# and pad/trim the audio to it explicitly — a 1 s drift at the tail is a real defect.
VDUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$V")
ADUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$A")
echo "mux: video ${VDUR}s  audio ${ADUR}s"

ffmpeg -y -v error -i "$V" -i "$A" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -af "apad" -t "$VDUR" \
  -movflags +faststart "$O"

echo "mux: wrote $O"
ffprobe -v error -show_entries stream=codec_name,width,height,channels -show_entries format=duration -of default=noprint_wrappers=1 "$O"
