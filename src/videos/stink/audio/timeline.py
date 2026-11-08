# timeline.py — the picture timeline, mirrored from src/videos/stink/story.ts.
#
# This module is the ONLY place the audio knows anything about the film. It exports the shot
# table, the word timings and the few instants the score and the sound design are built around,
# and nothing else: the bridge film's marching column, swing and tourists are gone with the
# bridge, so the cue tables in music.py / sfx.py were rewritten rather than stubbed. A stub
# imports cleanly and ships wrong audio.
#
# Everything here is derived from or checked against the same numbers story.ts uses:
#   TOTAL = 1877 frames @ 30 fps = 62.567 s
#   voice = voice/voice.wav (Andrew), 253 word boundaries, last word ends 62.3276 s
#
# Frame -> second is exact at 30 fps for integer frames (f/30), so a shot boundary taken from
# story.ts lands on the same sample in both pictures and sound.
import json

FPS = 30
TOTAL = 1877
DUR = TOTAL / FPS            # 62.566666... s -> ns(DUR) = 3,003,200 samples
fr = lambda f: f / FPS

# ---------------- shots ----------------
# id: (first frame, end frame)  — MUST equal story.ts SHOTS
SHOTS = {
    1: (0, 77), 2: (77, 220), 3: (220, 344), 4: (344, 407), 5: (407, 560),
    6: (560, 706), 7: (706, 840), 8: (840, 988), 9: (988, 1148), 10: (1148, 1353),
    11: (1353, 1464), 12: (1464, 1646), 13: (1646, 1752), 14: (1752, TOTAL),
}

# crossfades (frames) at place changes — MUST equal story.ts XFADE
XFADE = {2: 8, 10: 10, 13: 8, 14: 8}

# ---------------- the beats the score and the sound design hang on ----------------
# Measured word onsets from voice/words.json (seconds). Named so the cue tables read as prose.
STANDING = 0.07      # "You are standing inside the British Parliament"
JULY = 2.57          # "It is July 1858"
MILLION = 7.61       # "London has two and a half million people"
THAMES = 12.86       # "The Thames."
SEWAGE = 14.63       # "It is untreated sewage"
CURTAINS = 18.68     # "Members soak the curtains in lime"
STINK = 23.81        # "The newspapers called it the Great Stink"
DRINKING = 27.35     # "Meanwhile, London had been drinking"
DECADES = 32.93      # "Then, after decades of refusing to pay"
BORROW = 36.29       # "They borrow three million pounds in eighteen days"
BAZALGETTE = 38.56   # "They hire an engineer called Joseph Bazalgette"
NOSENSE = 45.09      # "Now here is the part that makes no sense"
POISON = 48.41       # "They believed the smell itself was the poison. It was not."
FOULAIR = 49.09      # "The foul air was not spreading disease"
WORKED = 52.32       # "But the sewers worked anyway"
BEATEN = 56.00       # "The cholera had already been beaten"
MISTAKE = 61.28      # "London was saved by a mistake"

# The one place the music must SNAP to silence rather than glide: "It was not." — the film's
# turn. mix.py reads this name for its hard-cut automation.
SILENT = 48.41
FLASH = SILENT       # name kept so mix.py's flash handling keeps working

# impact kicks (story.ts KICKS) — the picture jolts on these, so the sound must land on them
HITS = [38.56, 48.41, 52.32, 61.28]
PUSHES = HITS
SWING_T = 0.0
PUSH0 = HITS[0]

# the tunnel reveal and the two water events the SFX need to know about
TUNNEL = 38.56
RIVER_GOLD = 54.87


def shot_t(i):
    a, b = SHOTS[i]
    return fr(a), fr(b)


def shot_at(t):
    f = t * FPS
    for i, (a, b) in SHOTS.items():
        if a <= f < b:
            return i
    return len(SHOTS)


def words(path):
    return json.load(open(path, encoding="utf-8"))


def voice_end(path):
    """the last word's end — the film must not outlast it by more than a second"""
    return max(float(w["e"]) for w in words(path))
