#!/usr/bin/env bash
# qa-gate.sh v2 — the one judge of "is this short finished?".
# Run it from the PROJECT folder (where SCRIPT.md lives). Usage:
#   bash <skill-dir>/assets/scripts/qa-gate.sh <final.mp4> [render.log]
# Exit 0 = PASS, exit 1 = FAIL. Every FAIL cites its evidence.
#
# Every check below exists because a real defect shipped in the 2026-11 "dogwater" short:
#   WORDS     109 spoken words made a 43 s film. Spec is 150-260 words = 55-70 s.
#   404       every prop .glb 404'd in the 2K render log; the film shipped with an
#             empty set. Missing props do NOT crash a render — they silently vanish.
#   RES       a 432x768 proxy was delivered as the final video.
#   DURATION  43 s vs the 55-70 s spec.
#   LOUDNESS  -14 LUFS integrated is the channel standard.
#   POPS / BLACK / FROZEN  glitches and dead frames the proxy QA had already
#             flagged — and which shipped anyway.
set -u

VID="${1:-}"
LOG="${2:-}"
SHOTS="${3:-}"   # optional shots.json: planned cuts/xfades/flash
GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../assets/scripts
QA_PY="$GATE_DIR/short_qa.py"
OUT_DIR="qa-gate-out"          # written into the project folder; never deletes anything

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; DIM=$'\e[38;5;245m'; CLR=$'\e[0m'
fails=0; passes=0; warns=0
say_pass() { printf '%sPASS%s  %s\n' "$GRN" "$CLR" "$1"; passes=$((passes+1)); }
say_fail() { printf '%sFAIL%s  %s\n' "$RED" "$CLR" "$1"; fails=$((fails+1)); }
say_warn() { printf '%sWARN%s  %s\n' "$YLW" "$CLR" "$1"; warns=$((warns+1)); }
hdr()      { printf '\n%s== %s%s\n' "$DIM" "$CLR" "$1"; }

[ -f "$VID" ] || { echo "qa-gate: no video file at '$VID' — usage: qa-gate.sh <final.mp4> [render.log]"; exit 1; }
mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------- SPECS ----
hdr "SPECS"
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width  -of csv=p=0 "$VID")
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$VID")
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VID")
NF=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$VID")
AUD=$(ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "$VID")
echo "file: $VID"
echo "      ${W}x${H}  ${DUR}s  ${NF} frames  audio: ${AUD:-NONE}"

if [ "$W" = "1440" ] && [ "$H" = "2560" ]; then
  say_pass "resolution 1440x2560 (2K vertical)"
elif [ "$W" = "1080" ] && [ "$H" = "1920" ]; then
  say_warn "resolution 1080x1920 — accepted, but the standard is 1440x2560 (render at scale 4/3)"
else
  say_fail "resolution ${W}x${H} — a proxy or low-res render is NOT a deliverable. Re-render at 2K with scale 4/3 (never 1.3333: 1080x1.3333 = 1439.96 px, h264 rejects the odd width)"
fi

if awk -v d="$DUR" 'BEGIN{exit !(d>=55 && d<=70)}'; then
  say_pass "duration ${DUR}s (55-70 s)"
else
  say_fail "duration ${DUR}s — outside 55-70 s. The script is the wrong length. Fix SCRIPT.md and re-run from the voice step; never stretch the audio"
fi

if [ "$AUD" = "audio" ]; then
  say_pass "audio track present"
else
  say_fail "no audio track — the mux step was skipped. Mux with: ffmpeg -i video_silent.mp4 -i mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest"
fi

# ----------------------------------------------------------------- 404 ----
hdr "RENDER LOG (missing props)"
if [ -n "$LOG" ] && [ -f "$LOG" ]; then
  # Do NOT grep for a bare "404". The renderer prints a progress line per frame —
  # "frame 404/471  96.1 s/frame" — so a frame index containing 404 matches, and a
  # perfectly clean render FAILS the gate on a false positive. Require the HTTP context
  # that an actual missing asset produces.
  N404=$(grep -ciE "GET [^ ]* 404|404 (Not Found|\(Not Found\))|failed to load resource|cannot stat.*\.glb" "$LOG" || true)
  if [ "${N404:-0}" -gt 0 ]; then
    say_fail "$N404 asset-load failure lines — props are MISSING from the render (this exact defect shipped an empty set). Copy assets/kenney into public/bridge/kenney and re-render"
    grep -iE "GET [^ ]* 404|404 (Not Found|\(Not Found\))|failed to load resource" "$LOG" | head -5 | sed 's/^/       /'
  else
    say_pass "no asset 404s in the render log"
  fi
else
  say_warn "no render log given (pass it as arg 2) — the 404 defect is invisible in the finished mp4"
fi

# --------------------------------------------------------- SCRIPT WORDS ----
hdr "SCRIPT LENGTH"
if [ -f "SCRIPT.md" ]; then
  # spoken body = SCRIPT.md minus the '# ' title line and the 'Facts:' block
  WORDS=$(awk 'BEGIN{s=0} /^# /{next} /^Facts:/{f=1} f&&/^$/{f=0;next} f{next} {gsub(/<[^>]*>/,""); n=split($0,a,/[ \t]+/); for(i=1;i<=n;i++) if(a[i]!=""&&a[i]!="-"&&a[i]~/[A-Za-z0-9]/) s+=1} END{print s}' SCRIPT.md)
  if [ -z "$WORDS" ] || [ "$WORDS" -eq 0 ]; then
    say_warn "SCRIPT.md not in the Step-1 shape — could not count words"
  elif [ "$WORDS" -ge 150 ] && [ "$WORDS" -le 260 ]; then
    say_pass "script body $WORDS words (150-260)"
  else
    say_fail "script body $WORDS words — outside 150-260 (= 55-70 s at ~3.7 words/s). Rewrite and re-run from the voice step"
  fi
else
  say_warn "no SCRIPT.md in this folder — word-count check skipped (run the gate from the project folder)"
fi

# ------------------------------------------------------ FRAME-LEVEL QA ----
hdr "FRAMES + LOUDNESS"
if [ -f "$QA_PY" ]; then
  QA_OUT="$OUT_DIR/qa_$(date +%H%M%S)"
  # shots.json marks PLANNED cuts/crossfades/flash so they don't read as pops. Without it,
  # every hard cut is a false positive — pass it whenever story.ts defines SHOTS.
  if [ -n "$SHOTS" ] && [ -f "$SHOTS" ]; then
    python3 "$QA_PY" "$VID" "$QA_OUT" "$SHOTS" > "$QA_OUT.stdout" 2>&1
    RC=$?
  else
    python3 "$QA_PY" "$VID" "$QA_OUT" > "$QA_OUT.stdout" 2>&1
    RC=$?
    [ -n "$SHOTS" ] && say_warn "shots.json '$SHOTS' not found — ran without planned windows; hard cuts will read as pops"
  fi
  if [ $RC -eq 0 ]; then
    cat "$QA_OUT.stdout"
    REP="$QA_OUT/report.md"
    if grep -q "black \[\]" "$REP" && grep -q "unplanned white \[\]" "$REP" && grep -qE "frozen spans >=12f \[\]" "$REP"; then
      say_pass "no black/white frames, no frozen spans"
    else
      say_fail "black frames, unplanned white frames or frozen spans found — read $REP, fix the shot, re-render"
    fi
    POPS=$(grep -oE "POPS \(unplanned frame-diff spikes > 3x local median\): \[.*\]" "$REP" | grep -oE "\[.*\]" || echo "")
    if [ "$POPS" = "[]" ]; then
      say_pass "no unplanned pop frames"
    elif [ -n "$POPS" ]; then
      say_fail "pop frames $POPS — unplanned frame-diff spikes (glitches). Fix the shots involved and re-render"
    fi
    LUFS=$(grep -oE "I: +-?[0-9.]+ LUFS" "$REP" | grep -oE "\-?[0-9.]+" | head -1)
    if [ -n "$LUFS" ]; then
      if awk -v l="$LUFS" 'BEGIN{exit !(l<=-13.0 && l>=-16.0)}'; then
        say_pass "loudness ${LUFS} LUFS (target -14 ±1.5)"
      else
        say_fail "loudness ${LUFS} LUFS — outside -14 ±1.5. Re-run the mix (music +3 dB, SFX -6 dB, voice unchanged)"
      fi
    fi
  else
    say_fail "short_qa.py itself crashed — read $QA_OUT.stdout. A broken QA tool is a STOP, not a pass"
    tail -5 "$QA_OUT.stdout" | sed 's/^/       /'
  fi
else
  say_warn "short_qa.py not next to this script — frame/loudness checks skipped"
fi

# ------------------------------------------------------------- VERDICT ----
printf '\n%s-----------------------------------------%s\n' "$DIM" "$CLR"
if [ "$fails" -eq 0 ]; then
  printf '%sqa-gate: OK%s  %d passed' "$GRN" "$CLR" "$passes"
  if [ "$warns" -gt 0 ]; then printf ', %d warning(s) — read them and decide honestly' "$warns"; fi
  printf '\nYou may deliver. Write down the gate output in PROGRESS.md.\n'
  exit 0
else
  printf '%sqa-gate: FAILED%s  %d failed, %d passed\n' "$RED" "$CLR" "$fails" "$passes"
  printf 'A failed gate is not the end of the work — it IS the work. Fix, re-render, re-gate.\n'
  printf 'Never call a video finished while the gate says FAILED. Never edit this script to pass.\n'
  exit 1
fi
