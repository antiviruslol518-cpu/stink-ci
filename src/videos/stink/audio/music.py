# Original score for "The Great Stink" (London, July 1858), synthesized here in D minor.
#
# The film is not a march. It is a city suffocating in its own sewage while the men who could
# have fixed it argued about the bill, and the one thing that finally worked did so for the
# wrong reason. So the score is built on a low sustained drone rather than a beat: D minor,
# slow, no whistling column, no oom-pah. The pulse only appears when the film talks about
# NUMBERS (two and a half million people, three million pounds, eighty two miles) — a dry
# pizzicato ostinato that ticks like a ledger.
#
# The one structural rule: the music SNAPS DEAD at T.SILENT = 48.41 s, on "It was not." That
# is the film's turn — the belief that smell itself was disease is refuted in three words — and
# a score underneath it would soften the only hard edge in the piece. Silence runs 48.41-52.32,
# then a single warm chord returns under "But the sewers worked anyway."
#
# Section boundaries are the shot boundaries from story.ts wherever the picture changes place,
# and the named word onsets from timeline.py wherever it changes argument. mix.py reads
# SECTIONS for its per-section level automation, so SECTIONS must tile 0..T.DUR with no gaps
# and no overlaps, and every name except "dropout" must appear in MUSIC_TARGET.
import numpy as np
from dsp import SR, ns, rng, pan, place, dbg, make_ir, convolve_st, integrated, hp
import instruments as I
import timeline as T

N = ns(T.DUR)
F = I.m2f

# ---- the sections (name, start, end); must tile 0 .. T.DUR exactly -----------------------
# "dropout" is the silence: mix.py skips it when computing levels and hard-cuts around it.
SECTIONS = [
    ("breath",   0.000,  2.567),   # shot 1  "you cannot breathe"        the room holds its breath
    ("city",     2.567,  7.333),   # shot 2  the reveal                   low swell, one bell
    ("millions", 7.333, 11.467),   # shot 3  two and a half million       the ledger starts ticking
    ("river",   11.467, 13.567),   # shot 4  "The Thames."                the ticking stops; a cold bell
    ("sludge",  13.567, 18.667),   # shot 5  "it is untreated sewage"     weight, tuba
    ("lime",    18.667, 23.533),   # shot 6  curtains and handkerchiefs   a grotesque music box
    ("empty",   23.533, 28.000),   # shot 7  the chamber empties          the box, alone
    ("cholera", 28.000, 32.933),   # shot 8  drinking from the same river dread, a rising line
    ("borrow",  32.933, 38.267),   # shot 9  three million in eighteen days the ledger again, driving
    ("tunnel",  38.267, 45.100),   # shot 10 inside the sewer             the biggest music in the film
    ("nosense", 45.100, 48.410),   # shot 11 "the smell itself was the poison"  pulls back to nothing
    ("dropout", 48.410, 52.320),   # shot 12 "It was not."                SILENCE
    ("worked",  52.320, 54.867),   # shot 12 "the sewers worked anyway"   one warm chord
    ("saved",   54.867, 58.400),   # shot 13 the river, golden            the theme, finally calm
    ("mistake", 58.400, T.DUR),    # shot 14 "saved by a mistake"         resolves, and stops
]

# Music level per section, LU below the voice in that section (mix.py turns these into gains).
# The drone sections sit well under the narration; only the tunnel is allowed to compete.
MUSIC_TARGET = {
    "breath": -15.5, "city": -13.0, "millions": -12.0, "river": -14.5, "sludge": -12.5,
    "lime": -14.0, "empty": -15.0, "cholera": -13.0, "borrow": -11.5, "tunnel": -11.0,
    "nosense": -13.5, "worked": -16.0, "saved": -13.5, "mistake": -14.5,
}

# ---- harmony ---------------------------------------------------------------------------
# D minor throughout, with A major (C#) when the harmony has to lean — that raised seventh is
# what makes it read as Victorian rather than merely sad.
CH = {
    "Dm":  dict(lo=38, mid=[50, 53, 57], hi=[62, 65, 69]),
    "Gm":  dict(lo=43, mid=[50, 55, 58], hi=[62, 67, 70]),
    "Bb":  dict(lo=46, mid=[50, 53, 58], hi=[62, 65, 70]),
    "F":   dict(lo=41, mid=[53, 57, 60], hi=[65, 69, 72]),
    "C":   dict(lo=36, mid=[48, 52, 55], hi=[60, 64, 67]),
    "A":   dict(lo=45, mid=[52, 57, 61], hi=[64, 69, 73]),
    "Dmaj": dict(lo=38, mid=[50, 54, 57], hi=[62, 66, 69]),   # only at the very end
}


class Band:
    def __init__(self):
        self.tr = {}
        self.send = {}
        self.cues = []

    def track(self, name, send):
        if name not in self.tr:
            self.tr[name] = np.zeros((2, N))
            self.send[name] = send
        return self.tr[name]

    def add(self, name, x, t, p=0.0, g=1.0, send=None):
        if t >= T.DUR:
            return
        buf = self.track(name, 0.2 if send is None else send)
        place(buf, pan(x, p) if np.ndim(x) == 1 else x, t, g)

    def cue(self, t, text):
        self.cues.append((float(t), text))


R = rng(1858)


def _r():
    return rng(int(R.integers(1 << 30)))


# ---- the few gestures the whole score is made of ---------------------------------------

def drone(b, t0, t1, chord="Dm", vel=0.5, name="pad", att=0.9, rel=1.0, octave=-12):
    """one sustained low chord: the floor of the score. Everything else sits on top of it."""
    c = CH[chord]
    freqs = [F(c["lo"] + octave)] + [F(m) for m in c["mid"]]
    b.add(name, I.pad(freqs, t1 - t0, vel, _r(), att=att, rel=rel, warm=700.0, detune=9.0), t0, 0.0)


def bell(b, t, midi, vel=0.5, p=0.0, dur=2.2):
    """a single cold struck note — the film's punctuation mark"""
    b.add("glock", I.glock(F(midi), vel, _r(), dur=dur), t, p)


def hit(b, t, chord="Dm", vel=0.75, p=0.0):
    """timpani + low brass together: the weight that lands on a named beat"""
    c = CH[chord]
    b.add("timpani", I.timpani(F(c["lo"]), vel, _r(), dur=2.4), t, -0.05)
    for m in [c["lo"], c["lo"] + 12] + c["mid"][:2]:
        b.add("stab", I.brass(F(m), 0.22, vel * 0.8, _r(), "stab", scoop=-14), t, p + (m - 50) / 40)


def ledger(b, t0, t1, chord="Dm", step=0.25, vel=0.4, p=0.0):
    """the pizzicato ostinato: the sound of counting. Used only for NUMBERS."""
    c = CH[chord]
    fig = [c["lo"] + 12, c["mid"][0], c["mid"][1], c["mid"][0], c["mid"][2], c["mid"][1], c["mid"][0], c["mid"][1]]
    k = 0
    t = t0
    while t < t1 - 1e-6:
        m = fig[k % len(fig)]
        b.add("pluck", I.pluck(F(m), vel * R.uniform(0.82, 1.0), _r(), dur=step * 1.6, bright=0.45), t, p)
        t += step
        k += 1


def tune(b, name, notes, vel, fn="glock", p=0.0, gate=0.9):
    """a sparse melodic line; `notes` is a list of (t, dur, midi)"""
    for (t, d, m) in notes:
        if t >= T.DUR:
            continue
        if fn == "glock":
            x = I.glock(F(m), vel * R.uniform(0.92, 1.05), _r())
        elif fn == "musicbox":
            x = I.musicbox(F(m), vel * R.uniform(0.92, 1.05), _r())
        elif fn == "vibes":
            x = I.vibes(F(m), vel * R.uniform(0.92, 1.05), _r(), dur=max(1.4, d + 0.9), damp=d + 0.4)
        elif fn == "fife":
            x = I.fife(F(m), d * gate, vel * R.uniform(0.94, 1.04), _r())
        else:
            raise ValueError(fn)
        b.add(name, x, t, p)


# ---- the theme ---------------------------------------------------------------------------
# Eight notes, D minor, falling. It is stated once in "city", broken up in "millions", and only
# comes back whole in "saved" — which is the point: the same tune, finally allowed to finish.
THEME = [(0.0, 1.0, 69), (1.0, 0.5, 67), (1.5, 0.5, 65), (2.0, 1.0, 64), (3.0, 1.5, 62),
         (4.5, 0.5, 64), (5.0, 1.0, 65), (6.0, 2.0, 62)]


def theme_at(t0, vel=0.4, fn="glock", p=0.0, octave=0):
    return [(t0 + t, d, m + octave) for (t, d, m) in THEME]


# =========================================================================================
def build():
    b = Band()
    for name, send in [("pad", 0.30), ("pluck", 0.16), ("glock", 0.28), ("musicbox", 0.30),
                       ("vibes", 0.30), ("tuba", 0.12), ("stab", 0.20), ("timpani", 0.22),
                       ("cymbal", 0.20), ("fife", 0.18)]:
        b.track(name, send)

    # ============ 1 BREATH 0 - 2.567: "you are standing inside the British Parliament"
    # The room itself. A held D minor with the raised seventh leaning into it, a tuba an octave
    # below, and one struck note exactly on "standing". No pulse: the chamber is still.
    drone(b, 0.0, 2.75, "Dm", 0.55, att=0.55, rel=0.5)
    b.add("tuba", I.brass(F(38), 2.5, 0.35, _r(), "soft", scoop=-10), 0.0, -0.1)
    bell(b, T.STANDING, 74, 0.28, -0.2)                    # E5 — the dissonance, unresolved
    bell(b, 1.95, 81, 0.16, 0.25)
    b.cue(0.0, "held Dm (add E), tuba D2, one struck E5 on 'standing' — the room, no pulse")

    # ============ 2 CITY 2.567 - 7.333: the reveal — palace + sludge river
    # A low swell that rises under the sentence, the theme stated for the first time (soft,
    # alone), and a timpani roll into "million".
    drone(b, 2.567, 7.6, "Dm", 0.5, att=0.8, rel=0.7)
    b.add("tuba", I.brass(F(38), 2.2, 0.42, _r(), "tuba", scoop=-18), 2.6, -0.1)
    b.add("tuba", I.brass(F(41), 1.6, 0.38, _r(), "tuba", scoop=-18), 4.9, -0.1)
    tune(b, "glock", theme_at(3.1, 0.30, "glock", -0.15, octave=-12), 0.30)
    hit(b, T.JULY, "Dm", 0.55, -0.05)
    for t, v in I.snare_roll(7.05, 7.60, 0.05, 0.30, _r(), rate=18.0):
        b.add("timpani", I.timpani(F(38), v * 0.5, _r(), dur=0.35), t, -0.05)
    b.cue(2.567, "low Dm swell, theme stated soft on glock; timpani hit on 'July 1858'")
    b.cue(7.05, "timpani roll into 'million'")

    # ============ 3 MILLIONS 7.333 - 11.467: "two and a half million people"
    # The ledger starts. This is the only place before the tunnel with a real pulse, and it is
    # dry and small — counting, not marching.
    drone(b, 7.333, 11.5, "Dm", 0.42, att=0.5, rel=0.6)
    hit(b, T.MILLION, "Dm", 0.7, -0.05)
    ledger(b, 7.61, 11.35, "Dm", step=0.25, vel=0.34, p=-0.12)
    ledger(b, 8.61, 11.35, "Gm", step=0.5, vel=0.26, p=0.18)
    tune(b, "glock", [(9.0, 0.5, 74), (9.5, 0.5, 77), (10.0, 0.5, 81), (10.5, 1.0, 79)], 0.26, p=0.2)
    b.cue(7.61, "pizzicato ledger ostinato (Dm then Gm): the sound of counting")

    # ============ 4 RIVER 11.467 - 13.567: "The Thames. It is not water anymore."
    # Everything stops except one low chord and a cold bell on the word. The drop from the
    # ostinato into this emptiness IS the sentence.
    drone(b, 11.467, 13.7, "Bb", 0.4, att=0.35, rel=0.5)
    bell(b, T.THAMES, 86, 0.34, 0.0, dur=3.0)              # D6, high and thin
    b.add("tuba", I.brass(F(34), 2.0, 0.3, _r(), "soft", scoop=-8), 11.5, -0.1)
    b.cue(11.467, "the ledger stops; Bb drone + one cold D6 on 'The Thames'")

    # ============ 5 SLUDGE 13.567 - 18.667: "It is untreated sewage ... built directly beside it"
    # Weight returns. Low brass on the beat, no melody: this is a description, not an argument.
    drone(b, 13.567, 18.75, "Dm", 0.5, att=0.45, rel=0.6)
    hit(b, T.SEWAGE, "Dm", 0.8, -0.05)
    for k, m in enumerate([38, 38, 41, 38, 36, 38]):
        t = 14.63 + k * 0.75
        if t < 18.5:
            b.add("tuba", I.brass(F(m), 0.55, 0.5, _r(), "tuba", scoop=-20), t, -0.1)
    tune(b, "glock", [(16.2, 0.5, 74), (16.9, 0.5, 72), (17.6, 1.2, 70)], 0.22, p=0.25)
    b.cue(14.63, "tuba pulse on the beat, low Dm drone, falling glock figure")

    # ============ 6 LIME 18.667 - 23.533: "Members soak the curtains in lime ... St Albans"
    # The grotesque joke of the film: grown men soaking curtains to hide a smell. A music box
    # playing a stiff little D minor waltz, deliberately too pretty for what it is covering.
    drone(b, 18.667, 23.6, "Gm", 0.32, att=0.5, rel=0.5)
    box = [(18.68, 0.5, 74), (19.18, 0.5, 77), (19.68, 0.5, 81), (20.18, 1.0, 79),
           (21.18, 0.5, 77), (21.68, 0.5, 74), (22.18, 0.5, 70), (22.68, 0.8, 69)]
    tune(b, "musicbox", box, 0.30, "musicbox", p=0.15)
    for k, m in enumerate([55, 58, 62, 55, 58, 62]):
        t = 18.68 + k * 0.75
        if t < 23.3:
            b.add("pluck", I.pluck(F(m - 12), 0.24, _r(), dur=0.6, bright=0.35), t, -0.2)
    b.cue(18.68, "grotesque music-box waltz in Gm over pizzicato — the lime and the handkerchiefs")

    # ============ 7 EMPTY 23.533 - 28.000: "strong enough to empty a debating chamber"
    # The box loses its accompaniment and slows into single notes. The emptying is audible.
    drone(b, 23.533, 28.05, "Dm", 0.34, att=0.6, rel=0.6)
    tune(b, "musicbox", [(23.81, 0.9, 74), (24.9, 0.9, 72), (26.0, 1.2, 69), (27.35, 1.6, 65)], 0.24, "musicbox", p=0.1)
    b.cue(23.81, "music box alone, one note every ~1 s — the chamber emptying on 'Great Stink'")

    # ============ 8 CHOLERA 28.000 - 32.933: "London had been drinking from that same river"
    # A chromatic rise in the bass, the one thing that never resolves. Dread without a beat.
    drone(b, 28.0, 32.95, "A", 0.4, att=0.7, rel=0.6)
    climb = [(28.0, 45), (28.9, 46), (29.8, 47), (30.7, 48), (31.6, 49), (32.4, 50)]
    for t, m in climb:
        b.add("tuba", I.brass(F(m - 12), 1.1, 0.42 + 0.02 * (m - 45), _r(), "soft", scoop=-10), t, -0.1)
    b.add("timpani", I.timpani(F(45), 0.45, _r(), dur=2.0), T.DRINKING, -0.05)
    tune(b, "glock", [(29.4, 0.5, 76), (30.2, 0.5, 77), (31.0, 0.5, 79), (31.8, 1.0, 81)], 0.22, p=0.2)
    b.cue(27.35, "A pedal with a chromatic bass climb (A-Bb-B-C-C#-D) — no resolution, dread")

    # ============ 9 BORROW 32.933 - 38.267: "three million pounds in eighteen days"
    # The ledger again, but faster and lower, and it accelerates: eighteen days is the point.
    drone(b, 32.933, 38.3, "Dm", 0.46, att=0.4, rel=0.5)
    hit(b, T.DECADES, "Dm", 0.6, -0.05)
    ledger(b, 32.93, 35.6, "Dm", step=0.25, vel=0.36, p=-0.12)
    ledger(b, 35.6, 38.1, "Dm", step=0.1875, vel=0.42, p=-0.12)
    ledger(b, 34.0, 38.1, "A", step=0.375, vel=0.3, p=0.2)
    hit(b, T.BORROW, "A", 0.85, -0.05)
    b.cue(32.93, "ledger ostinato returns and tightens (0.25 s -> 0.1875 s steps): eighteen days")
    b.cue(36.29, "A major hit on 'borrow three million pounds'")

    # ============ 10 TUNNEL 38.267 - 45.100: inside the sewer with Bazalgette's navvies
    # The loudest, densest music in the film, and the only place with a full low end. The tunnel
    # reveal lands on a named hit; then it becomes mechanical — brick, water, men working.
    hit(b, T.BAZALGETTE, "Dm", 1.0, -0.05)
    b.add("cymbal", I.cymbal(0.34, _r(), dur=2.6), T.BAZALGETTE, 0.0)
    drone(b, 38.267, 45.15, "Dm", 0.62, att=0.3, rel=0.6)
    for k in range(14):
        t = 38.56 + k * 0.5
        if t >= 45.0:
            break
        ch = "Dm" if k % 4 < 2 else ("Bb" if k % 8 < 4 else "Gm")
        c = CH[ch]
        b.add("tuba", I.brass(F(c["lo"]), 0.4, 0.6, _r(), "tuba", scoop=-24), t, -0.1)
        b.add("timpani", I.timpani(F(c["lo"]), 0.34, _r(), dur=0.7), t + 0.25, -0.05)
    # the theme, low and slow, buried in the middle of the tunnel work
    tune(b, "glock", theme_at(39.6, 0.28, "glock", 0.15, octave=-12), 0.28)
    tune(b, "fife", [(41.6, 0.5, 69), (42.1, 0.5, 67), (42.6, 0.5, 65), (43.1, 1.5, 64)], 0.24, "fife", p=-0.2)
    b.cue(38.56, "TUNNEL HIT on 'Bazalgette': brass + timpani + cymbal, then a mechanical tuba/timpani pulse")
    b.cue(39.6, "theme, an octave down, half-buried under the work rhythm")

    # ============ 11 NOSENSE 45.100 - 48.410: "the smell itself was the poison"
    # Strip everything. By 48.4 there is one held note left and it is about to be cut.
    drone(b, 45.1, 48.42, "A", 0.3, att=0.35, rel=0.05)
    b.add("tuba", I.brass(F(33), 3.2, 0.26, _r(), "soft", scoop=-6), 45.1, -0.1)
    tune(b, "glock", [(45.4, 0.8, 73), (46.3, 0.8, 76), (47.2, 1.1, 79)], 0.2, p=0.1)
    b.cue(45.09, "everything pulls back to one A pedal and three rising bells — 'the part that makes no sense'")

    # ============ 12 DROPOUT 48.410 - 52.320: "It was not." — SILENCE
    # Nothing is placed here. The gate below enforces it even if a tail from section 11 runs on.
    b.cue(T.SILENT, "SILENCE: music snaps dead on 'It was not.' and stays out for 3.9 s")

    # ============ 13 WORKED 52.320 - 54.867: "But the sewers worked anyway"
    # One warm chord, Dmaj-in-Dm: the first consonance in the film. Quiet, and it does not build.
    drone(b, 52.32, 54.95, "Dmaj", 0.34, att=0.8, rel=0.6)
    b.add("vibes", I.vibes(F(69), 0.3, _r(), dur=2.4, damp=1.6), 52.32, 0.0)
    b.add("vibes", I.vibes(F(74), 0.24, _r(), dur=2.2, damp=1.4), 53.1, 0.2)
    b.cue(52.32, "the music returns as one warm D-major chord — the first consonance in the film")

    # ============ 14 SAVED 54.867 - 58.400: the river, golden
    # The theme completes for the first time, in the open, on vibes. It is allowed to finish.
    drone(b, 54.867, 58.45, "Dmaj", 0.42, att=0.6, rel=0.7)
    tune(b, "vibes", theme_at(55.0, 0.34, "vibes", 0.1), 0.34, "vibes")
    b.add("tuba", I.brass(F(38), 2.6, 0.3, _r(), "soft", scoop=-8), 55.0, -0.1)
    b.add("timpani", I.timpani(F(38), 0.34, _r(), dur=2.2), T.BEATEN, -0.05)
    b.cue(54.867, "THEME COMPLETES on vibes in D major — the first time the tune is allowed to finish")
    b.cue(56.00, "soft timpani D on 'the cholera had already been beaten'")

    # ============ 15 MISTAKE 58.400 - 62.567: "London was saved by a mistake"
    # Back to D minor for the last word. A single struck note on "mistake", and the drone decays
    # to nothing — the film ends on the sound of a room emptying.
    drone(b, 58.4, T.DUR, "Dm", 0.36, att=0.5, rel=1.6)
    tune(b, "vibes", [(58.4, 0.8, 69), (59.3, 0.8, 67), (60.2, 1.2, 65)], 0.28, "vibes", p=-0.1)
    bell(b, T.MISTAKE, 62, 0.34, 0.0, dur=2.4)             # D4, low, on the last word
    b.add("tuba", I.brass(F(26), 3.0, 0.3, _r(), "soft", scoop=-6), 58.5, -0.1)
    b.cue(58.4, "D minor returns: the tune falls, one low D4 struck on 'mistake', drone decays")
    b.cue(T.MISTAKE, "final struck D4 on 'a mistake' (61.28)")

    # ============ the silence gate ========================================================
    # SECTIONS is a description; this is the enforcement. Zero the whole band from T.SILENT to
    # the return of "worked", with short ramps so the cut is a snap rather than a click.
    gate = np.ones(N)
    a0, a1 = ns(T.SILENT - 0.012), ns(T.SILENT)
    gate[a0:a1] = np.linspace(1, 0, a1 - a0)
    gate[a1:ns(52.32)] = 0.0
    a2, a3 = ns(52.32), ns(52.32 + 0.02)
    gate[a2:a3] = np.linspace(0, 1, a3 - a2)
    for k in b.tr:
        b.tr[k] *= gate[None, :]

    # tail fade so nothing clicks against the end of the picture
    end = np.ones(N)
    a = ns(T.DUR - 0.45)
    end[a:] = np.linspace(1, 0, N - a) ** 1.4
    for k in b.tr:
        b.tr[k] *= end[None, :]

    return b


# relative balance inside the band, LU, measured on each track's own active span
TARGET = {
    "pad": -2.0, "pluck": -6.0, "glock": -4.0, "musicbox": -5.0, "vibes": -4.0,
    "tuba": -2.5, "stab": -3.5, "timpani": -4.0, "cymbal": -12.0, "fife": -7.0,
}


def render(b, ref=-20.0):
    # A long, dark hall: the chamber and the river are both big stone rooms. The tunnel gets the
    # same room because a brick barrel is also a resonant space, just a dirtier one.
    hall = make_ir(2.4, 1858, pre=0.022, hf=1.2)
    wet = np.zeros((2, N))
    dry = np.zeros((2, N))
    levels = {}
    for k, x in b.tr.items():
        if not np.any(x):
            continue
        L = integrated(x)
        g = dbg(ref + TARGET.get(k, -6) - L)
        levels[k] = (round(L, 1), round(ref + TARGET.get(k, -6), 1))
        x = x * g
        b.tr[k] = x
        dry += x
        wet += b.send[k] * x
    out = dry + 0.85 * convolve_st(wet.mean(0), hall)
    out = hp(out, 32, 2)
    return out, levels
