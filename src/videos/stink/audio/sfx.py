# Original sound design for "The Great Stink" (London, July 1858) as a cue list timed to the picture
# (timeline.py), rendered into one stereo SFX stem.
#
# Level convention (the project's standard mix, unchanged): every EVENT carries a "naive" level in LU
# relative to the voice stem, measured as the event's max momentary loudness, and is placed SFX_DB = -6 dB
# under it; ambience BEDS carry an integrated loudness and are not reduced. `p` is a constant-power pan,
# `send` feeds the shared room reverb, `cut` hard-stops a cue at an instant.
#
# The sound world: London before electricity. Wood, iron, water, cloth, brick, human voices, birds, bells,
# wind. The river is the antagonist — low, wet, slow, bubbling, with no clean-water sparkle anywhere in it
# until the sewers are done. The one clean, bright sound in the film is the handkerchief coming away at
# 48.41 s ("It was not."): a release, not a stinger.
#
# Nothing here is bridge-specific: the marching column, deck flex, chain groan, bolt snap, drop, splash,
# swing squeaks, hammer-on-the-sign and tourist steps of the old film are gone with the bridge, and the
# timeline no longer exports the camera-distance helpers they used.
import numpy as np
from dsp import (SR, TAU, ns, tt, rng, dbg, lp, hp, bp, shelf, pan, st, place, fades, widen, make_ir,
                 convolve_st, momentary_max, integrated, colored, smooth_noise, modal, phase)
import sfx_gen as G
import timeline as T

N = ns(T.DUR)
SFX_DB = -6.0


class Cue:
    def __init__(self, t, name, desc, gen, naive, kind="event", p=0.0, extra=0.0, lpf=None, send=0.12, group=None, cut=None):
        self.t, self.name, self.desc, self.gen, self.naive = t, name, desc, gen, naive
        self.kind, self.p, self.extra, self.lpf, self.send, self.cut = kind, p, extra, lpf, send, cut
        self.group = group or name
        self.applied = naive + (SFX_DB if kind == "event" else 0.0) + extra
        self.measured = None


def cues():
    C = []
    R = rng(1858)
    rr = lambda: rng(int(R.integers(1 << 30)))
    add = C.append

    # ================================================================ ambience beds
    # One bed per place, overlapping by a few tenths at the joins and faded there, so the total bed
    # duration stays ~66 s (the old bridge cut) and a 4-vCPU runner never holds many long arrays at once.
    add(Cue(0.00, "amb_room", "Parliament at an open window: close airless stone-room tone, carriages through the glass, a fly (shot 1)",
            _cut(lambda: (_bed_room(3.10, 11), 0.0), 0.02, 0.55), -32, "bed", send=0.0))
    add(Cue(2.45, "amb_reveal", "the first smell: an ugly wet river bed swells in under distant London air (shot 2)",
            _cut(lambda: (_bed_reveal(5.10, 21), 0.0), 0.45, 0.55), -27, "bed", send=0.0))
    add(Cue(7.20, "amb_city", "London from above: carts on cobbles, distant voices, chimney draught, sparrows (shot 3)",
            _cut(lambda: (_bed_city(4.40, 31), 0.0), 0.35, 0.45), -27, "bed", send=0.0))
    add(Cue(11.35, "amb_sludge", "down on the water: thick, slow, bubbling sludge, no clean-water sparkle (shots 4-5)",
            _cut(lambda: (_bed_sludge(7.50, 41), 0.0), 0.35, 0.45), -24, "bed", send=0.0))
    add(Cue(18.55, "amb_chamber", "muffled chamber: handkerchiefed hubbub, coughing, cloth, a big close room (shot 6)",
            _cut(lambda: (_bed_chamber(5.10, 51), 0.0), 0.30, 0.40), -27, "bed", send=0.0))
    add(Cue(23.45, "amb_empty", "the emptied terrace: wind through the arches, a resonant draught, nothing else (shot 7)",
            _cut(lambda: (_bed_empty(4.70, 61), 0.0), 0.35, 0.50), -29, "bed", send=0.0))
    add(Cue(27.90, "amb_intake", "the water's edge: the same river close by, low voices, bank air (shot 8)",
            _cut(lambda: (_bed_intake(5.20, 71), 0.0), 0.35, 0.45), -26, "bed", send=0.0))
    add(Cue(32.95, "amb_debate", "a crowded chamber: many voices arguing, papers, benches, the swell of a vote (shot 9)",
            _cut(lambda: (_bed_debate(5.60, 81), 0.0), 0.30, 0.45), -25, "bed", send=0.0))
    add(Cue(38.15, "amb_tunnel", "inside the brick tunnel: deep enclosed rumble, far water, drips, a long dark reverb (shot 10)",
            _cut(lambda: (_bed_tunnel(7.10, 91), 0.0), 0.50, 0.55), -23, "bed", send=0.0))
    add(Cue(45.00, "amb_close", "close and muffled: a man breathing through cloth, the room pressed flat (shot 11)",
            _cut(lambda: (_bed_close(3.42, 101), 0.0), 0.25, 0.20), -29, "bed", send=0.0, cut=T.SILENT))
    add(Cue(T.SILENT, "amb_alive", "the room suddenly audible and normal: birds, market air, people, warm and open (shot 12)",
            _cut(lambda: (_bed_alive(6.50, 111), 0.0), 0.28, 0.45), -27, "bed", send=0.0))
    add(Cue(54.75, "amb_river_gold", "the river clean and wide: open flow, gentle laps, air over water (shot 13)",
            _cut(lambda: (_bed_gold(3.75, 121), 0.0), 0.30, 0.45), -24, "bed", send=0.0))
    add(Cue(58.30, "amb_wide", "the final pull-back: wide distant air, a low city, wind (shot 14)",
            _cut(lambda: (_bed_wide(4.27, 131), 0.0), 0.50, 0.70), -28, "bed", send=0.0))

    # ================================================================ shot 1 — inside Parliament, airless
    add(Cue(0.42, "carriage_far", "a carriage passes in the street below, hooves and iron tyres through glass",
            lambda r=rr(): (_carriage(r), 0.0), -28, p=-0.55, lpf=2200, send=0.10))
    add(Cue(2.10, "carriage_far", "a second carriage, further off", lambda r=rr(): (_carriage(r) * 0.6, 0.0),
            -31, p=0.45, lpf=1700, send=0.10, group="carriage_far"))

    # ================================================================ shot 2 — the reveal
    add(Cue(T.JULY, "reveal_air", "the smell arrives: a low, ugly wet swell as the palace and the river are revealed",
            lambda r=rr(): (_air_swell(2.60, r, bright=700, level=1.0), 0.0), -20, send=0.18))
    add(Cue(4.30, "oar_far", "a distant oar bites and lifts", lambda r=rr(): (_oar(r), 0.0), -27, p=0.42, lpf=2600, send=0.15))
    add(Cue(5.70, "gull", "a gull over the river", lambda r=rr(): (_gull(r), 0.0), -25, p=0.30, lpf=5000, send=0.18))
    add(Cue(6.60, "bubble_far", "one thick bubble turning over in the sludge", lambda r=rr(): (_bubble(r), 0.0),
            -26, p=-0.22, send=0.12))

    # ================================================================ shot 3 — 2.5 million people
    add(Cue(T.MILLION, "million_swell", "distant London rising on the number: thousands of voices, far off",
            lambda r=rr(): (_crowd_swell(2.60, r, 20, lpf=2400), 0.0), -19, send=0.22))
    add(Cue(8.55, "cart", "a cart crosses cobbles, wheels and a loose iron rim", lambda r=rr(): (_cart(r), 0.0),
            -20, p=-0.42, send=0.14))
    add(Cue(9.90, "bell_far", "a distant church bell, three strikes", lambda r=rr(): (_bell_strikes(r, 3, 1.15), 0.0),
            -19, p=0.25, send=0.32))
    add(Cue(10.60, "cart", "another cart, closer, off to the right", lambda r=rr(): (_cart(r) * 0.8, 0.0),
            -22, p=0.55, send=0.14, group="cart"))

    # ================================================================ shot 4 — the Thames, not water
    add(Cue(T.THAMES, "sludge_bloom", "the close sludge swells on the word: slow, thick, breathing",
            lambda r=rr(): (_sludge_swell(2.10, r, 900), 0.0), -15, send=0.10))
    add(Cue(13.20, "bubble_close", "a thick bubble breaks at the surface, right by the lens",
            lambda r=rr(): (_bubble(r, 0.9), 0.0), -22, p=0.22, send=0.08))

    # ================================================================ shot 5 — built directly beside it
    add(Cue(T.SEWAGE, "sewage_swell", "the sewage bed swells wide and low: the wrongness is architectural",
            lambda r=rr(): (_sludge_swell(2.70, r, 700) * 1.1, 0.0), -14, send=0.12))
    add(Cue(15.80, "sludge_slurp", "a slow slop against the wall", lambda r=rr(): (_slurp(r), 0.0),
            -21, p=-0.35, send=0.10))
    add(Cue(16.90, "bubble_close", "bubbles rising in a chain", lambda r=rr(): (_bubble(r, 1.2), 0.0),
            -23, p=0.50, send=0.08))
    add(Cue(17.90, "gull", "a gull, further off now", lambda r=rr(): (_gull(r) * 0.7, 0.0), -26, p=-0.60, send=0.20,
            group="gull"))

    # ================================================================ shot 6 — the Members and their handkerchiefs
    # The handkerchiefs lift on a 2.6 s cycle (18.68, 21.28, 23.88); the cloth is keyed to it.
    add(Cue(T.CURTAINS, "cloth_lift", "handkerchiefs lift 1/3: linen and wool dragged across a face",
            lambda r=rr(): (_cloth(r, 0.55), 0.0), -18, p=-0.20, send=0.22, group="handkerchief"))
    add(Cue(19.40, "cough_muffled", "a Member coughs into cloth", lambda r=rr(): (_cough(r, muffled=True), 0.0),
            -21, p=0.35, send=0.25))
    add(Cue(20.05, "gavel", "the Speaker's gavel, one knock", lambda r=rr(): (_gavel(r), 0.0),
            -19, p=-0.10, send=0.30))
    add(Cue(21.28, "cloth_lift", "handkerchiefs lift 2/3: a longer drag, more of them", lambda r=rr(): (_cloth(r, 0.65), 0.0),
            -19, p=0.25, send=0.22, group="handkerchief"))
    add(Cue(22.10, "cough_muffled", "another cough, further down the bench", lambda r=rr(): (_cough(r, muffled=True) * 0.8, 0.0),
            -23, p=-0.40, send=0.25, group="cough_muffled"))
    add(Cue(22.90, "papers", "order papers shuffled and folded", lambda r=rr(): (_papers(r), 0.0),
            -24, p=0.10, send=0.20))
    add(Cue(23.30, "cloth_lift", "the last handkerchief comes down, weaker, as the chamber empties",
            lambda r=rr(): (_cloth(r, 0.50) * 0.7, 0.0), -24, p=0.30, send=0.22, group="handkerchief"))

    # ================================================================ shot 7 — the emptied terrace
    add(Cue(T.STINK, "stink_gust", "wind comes through the empty terrace on 'the Great Stink'",
            lambda r=rr(): (_air_swell(2.30, r, bright=900, level=0.9), 0.0), -20, send=0.15))
    add(Cue(24.50, "door_far", "a distant door closes somewhere behind the terrace", lambda r=rr(): (_door(r), 0.0),
            -22, p=-0.30, send=0.35))
    add(Cue(25.20, "bird_lone", "a lone bird in the empty air", lambda r=rr(): (_bird_lone(r), 0.0),
            -23, p=-0.40, send=0.20))
    add(Cue(26.60, "gust", "a second gust, softer, through the arches", lambda r=rr(): (_air_swell(1.80, r, 800, 0.7), 0.0),
            -24, p=0.35, send=0.15, group="gust"))
    add(Cue(27.45, "water_far", "the first hint of the river, down at the water's edge",
            lambda r=rr(): (_water_far(1.60, r), 0.0), -26, p=0.20, send=0.12))

    # ================================================================ shot 8 — the water's edge (cholera)
    # Uncomfortable, not a horror stinger: household sounds of drawing drinking water from a sewer.
    add(Cue(28.15, "bucket_down", "a bucket goes down into the river and knocks the bank",
            lambda r=rr(): (_bucket_down(r), 0.0), -18, p=-0.25, send=0.18))
    add(Cue(28.90, "water_pour", "water poured from a full bucket into a pail", lambda r=rr(): (_pour(r), 0.0),
            -17, p=0.20, send=0.16))
    add(Cue(29.60, "ladle", "a ladle dips and knocks the pail rim", lambda r=rr(): (_ladle(r), 0.0),
            -20, p=0.10, send=0.16))
    add(Cue(30.20, "cough_dry", "a dry cough from the bank, close", lambda r=rr(): (_cough(r, muffled=False), 0.0),
            -18, p=-0.35, send=0.18))
    add(Cue(30.80, "child_voice", "a child says something short and flat, unanswered",
            lambda r=rr(): (_child(r), 0.0), -20, p=0.40, send=0.20))
    add(Cue(31.60, "water_pour", "a second bucket, tipped out, slower", lambda r=rr(): (_pour(r) * 0.8, 0.0),
            -19, p=-0.45, send=0.16, group="water_pour"))
    add(Cue(32.30, "bucket_rim", "the empty bucket set down on stone", lambda r=rr(): (_bucket_down(r, soft=True), 0.0),
            -23, p=-0.10, send=0.18))

    # ================================================================ shot 9 — the debate
    add(Cue(T.DECADES + 0.03, "debate_swell", "the chamber rises: many voices, benches, papers (shot 9)",
            lambda r=rr(): (_debate_swell(2.60, r), 0.0), -18, send=0.24))
    add(Cue(34.30, "papers", "a fistful of papers slapped down", lambda r=rr(): (_papers(r, hard=True), 0.0),
            -21, p=0.30, send=0.22))
    add(Cue(T.BORROW, "borrow_hit", "on 'three million pounds': a single deep, dry parliamentary thump and the room answers",
            lambda r=rr(): (_gavel_big(r), 0.0), -12, send=0.30))
    add(Cue(36.90, "bell_vote", "the division bell rings, urgent, twice", lambda r=rr(): (_bell_vote(r), 0.0),
            -18, p=-0.20, send=0.30))
    add(Cue(37.60, "debate_swell", "the vote swells and breaks up", lambda r=rr(): (_debate_swell(1.60, r) * 0.9, 0.0),
            -19, send=0.24, group="debate_swell"))

    # ================================================================ shot 10 — inside the sewer
    add(Cue(T.BAZALGETTE, "tunnel_in", "the tunnel takes the sound: a deep enclosed bloom, far water, brick",
            lambda r=rr(): (_tunnel_in(2.40, r), 0.0), -15, send=0.35))
    add(Cue(39.40, "pickaxe", "a pickaxe into brick, far down the tunnel", lambda r=rr(): (_pick(r), 0.0),
            -17, p=-0.30, send=0.42))
    add(Cue(40.10, "shovel", "a shovel scrapes and loads", lambda r=rr(): (_shovel(r), 0.0),
            -19, p=0.25, send=0.38))
    add(Cue(40.90, "pickaxe", "a second pick, closer", lambda r=rr(): (_pick(r) * 1.1, 0.0),
            -15, p=0.40, send=0.40, group="pick"))
    add(Cue(41.60, "drip", "water drips from the crown of the tunnel", lambda r=rr(): (_drip(r), 0.0),
            -22, p=-0.50, send=0.45))
    add(Cue(42.20, "navvy_call", "a navvy shouts something down the tunnel, lost in the brick",
            lambda r=rr(): (_call(r), 0.0), -19, p=-0.35, send=0.45))
    add(Cue(42.90, "shovel", "shovel and rubble", lambda r=rr(): (_shovel(r) * 0.9, 0.0),
            -20, p=-0.10, send=0.38, group="shovel"))
    add(Cue(43.60, "pickaxe", "a third pick, far off, in another gallery", lambda r=rr(): (_pick(r) * 0.8, 0.0),
            -20, p=0.55, lpf=3000, send=0.42, group="pick"))
    add(Cue(44.30, "lantern", "a lantern hisses as it is lifted", lambda r=rr(): (_lantern(r), 0.0),
            -24, p=0.20, send=0.30))
    add(Cue(44.80, "drip", "more drips, spreading", lambda r=rr(): (_drip(r) * 0.8, 0.0),
            -24, p=0.35, send=0.45, group="drip"))

    # ================================================================ shot 11 — close on a Member
    add(Cue(T.NOSENSE + 0.02, "breath_cloth", "a man breathing in through a handkerchief, close and absurd",
            lambda r=rr(): (_breath_cloth(r), 0.0), -20, p=0.10, send=0.16))
    add(Cue(46.10, "breath_cloth", "breath out, cloth fluttering", lambda r=rr(): (_breath_cloth(r, out=True), 0.0),
            -21, p=0.10, send=0.16, group="breath_cloth"))
    add(Cue(47.10, "cloth_lift", "the handkerchief is pulled away from the face", lambda r=rr(): (_cloth(r, 0.45), 0.0),
            -20, p=0.05, send=0.16, group="handkerchief"))

    # ================================================================ 48.41 — "It was not." (the turn)
    # A release, not a stinger: the muffled world opens. Cloth off, one clean intake of air, the room
    # suddenly wide and normal, a single bright bird outside.
    add(Cue(T.SILENT, "turn_cloth", "the handkerchief comes fully away: one clean flick of linen",
            lambda r=rr(): (_cloth_away(r), 0.0), -14, p=0.0, send=0.10))
    add(Cue(T.SILENT + 0.10, "turn_breath", "one clean, deep intake of breath — the first in the film",
            lambda r=rr(): (_breath_clean(r), 0.0), -15, p=0.0, send=0.06))
    add(Cue(T.SILENT + 0.30, "turn_room", "the room opens up: normal air, a window, life outside",
            lambda r=rr(): (_room_open(2.20, r), 0.0), -18, send=0.12))

    # ================================================================ shot 12 — alive
    add(Cue(T.FOULAIR, "market_air", "ordinary London life: a market's warmth, people, birds (shot 12)",
            lambda r=rr(): (_market(2.40, r), 0.0), -21, send=0.16))
    add(Cue(50.30, "bird_phrase", "a blackbird phrase from a rooftop", lambda r=rr(): (_bird_lone(r, bright=True), 0.0),
            -23, p=-0.35, send=0.18))
    add(Cue(51.20, "laugh", "someone laughs, two syllables, easy", lambda r=rr(): (_laugh(r), 0.0),
            -22, p=0.35, send=0.20))
    add(Cue(T.WORKED, "steps_pass", "a few ordinary footsteps pass left to right on stone",
            lambda r=rr(): (_steps(r), 0.0), -22, send=0.18))
    add(Cue(53.30, "child_play", "a child calls out, cheerful, and is answered", lambda r=rr(): (_child(r, happy=True), 0.0),
            -23, p=0.45, send=0.20))
    add(Cue(54.10, "bird_phrase", "sparrows in the eaves", lambda r=rr(): (_sparrows(r), 0.0),
            -25, p=-0.50, send=0.18, group="bird_phrase"))

    # ================================================================ shot 13 — the river, golden
    add(Cue(T.RIVER_GOLD, "river_open", "the river opens up clean and wide, and keeps going (shot 13)",
            lambda r=rr(): (_river_open(3.20, r), 0.0), -14, send=0.14))
    add(Cue(56.00, "water_lap", "a long soft lap against a bank", lambda r=rr(): (_lap(r), 0.0),
            -22, p=-0.40, send=0.14))
    add(Cue(57.30, "water_lap", "another lap, further out", lambda r=rr(): (_lap(r) * 0.8, 0.0),
            -24, p=0.50, send=0.14, group="water_lap"))

    # ================================================================ shot 14 — the pull-back
    add(Cue(T.MISTAKE, "bell_last", "one distant bell on 'saved by a mistake'", lambda r=rr(): (_bell_strikes(r, 1, 0.0), 0.0),
            -21, p=0.20, send=0.40))
    add(Cue(60.90, "wind_wide", "the last wind, wide and low", lambda r=rr(): (_air_swell(1.90, r, 600, 0.8), 0.0),
            -23, p=-0.20, send=0.20))
    add(Cue(61.90, "bird_final", "a single bird, once, and then nothing", lambda r=rr(): (_bird_lone(r, bright=True) * 0.7, 0.0),
            -26, p=0.45, send=0.30))
    return C


# ================================================================ small utilities
def _cut(gen, fin, fout):
    def g():
        x, a = gen()
        return fades(x, fin, fout), a
    return g


def _put(buf, x, i):
    """add mono x into mono buf at sample index i (clipped)"""
    i = int(i)
    if i >= len(buf) or i + len(x) <= 0:
        return
    a, b = max(0, i), min(len(buf), i + len(x))
    if b > a:
        buf[a:b] += x[a - i:b - i]


def _noise_burst(dur, r, lo, hi, tau, attack=0.002):
    n = ns(dur)
    t = np.arange(n) / SR
    x = bp(r.standard_normal(n), lo, hi, 1)
    return x * np.clip(t / attack, 0, 1) * np.exp(-t / tau)


def _stone_step(r, weight=1.0):
    """a boot on stone: heel knock + a short gritty scuff, no plank ring"""
    d = 0.26
    t = tt(d)
    heel = np.exp(-t / 0.022) * np.sin(phase(r.uniform(95, 135) * (1 + 0.12 * np.exp(-t / 0.008))))
    grit = bp(r.standard_normal(ns(d)), 900, 5200, 1) * np.exp(-t / 0.012) * 0.35
    body = modal(d, [(r.uniform(150, 240), 0.5, 0.02), (r.uniform(330, 520), 0.25, 0.012)], r) * 0.4
    return (heel * 0.9 + grit + body) * weight


def _wood_knock(dur, r, f_lo=140, f_hi=520, bright=0.35):
    """a wooden object struck: low body modes + a dry click"""
    t = tt(dur)
    md = [(r.uniform(f_lo, f_lo * 1.3), 1.0, r.uniform(0.05, 0.09)),
          (r.uniform(f_lo * 1.9, f_hi), 0.6, r.uniform(0.03, 0.05)),
          (r.uniform(f_hi * 1.6, f_hi * 2.4), 0.3, 0.02)]
    y = modal(dur, md, r)
    y += bp(r.standard_normal(ns(dur)), 600, 6000, 1) * np.exp(-t / 0.003) * bright
    return fades(y, 0.0, 0.03)


# ================================================================ voices
def _murmur_far(dur, r, voices, base=(95, 240), fmax=2600):
    """a crowd at a distance: many low-passed babbles, no words"""
    n = ns(dur)
    out = np.zeros(n)
    for v in range(voices):
        b = r.uniform(*base)
        y = G.babble(dur, r, b, r.uniform(1.0, 1.2), r.uniform(3.4, 4.8), r.uniform(0.5, 0.8), fmax=fmax)
        out += y * r.uniform(0.25, 0.8)
    return out


def _crowd_swell(dur, r, voices, lpf=2400):
    n = ns(dur)
    x = _murmur_far(dur, r, voices)
    t = np.arange(n) / SR
    env = np.clip(t / 0.7, 0, 1) ** 0.7 * np.clip((dur - t) / 0.9, 0, 1) ** 0.8
    x *= env
    return widen(lp(x, lpf, 1), r, 12, 0.7)


def _debate_swell(dur, r):
    n = ns(dur)
    x = _murmur_far(dur, r, 16, (90, 200), 3200)
    x += _murmur_far(dur, r, 6, (150, 260), 3800) * 0.7
    t = np.arange(n) / SR
    x *= np.clip(t / 0.5, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    # benches and papers under the voices
    rustle = bp(r.standard_normal(n), 1500, 7000, 1) * (0.5 + 0.5 * smooth_noise(n, r, 4.0)) * 0.06
    x += rustle
    return widen(lp(x, 3600, 1), r, 14, 0.8)


def _child(r, happy=False):
    d = r.uniform(0.5, 0.8) if happy else r.uniform(0.35, 0.55)
    n = ns(d)
    t = np.arange(n) / SR
    f0 = r.uniform(300, 360) * (1 + (0.22 if happy else -0.08) * np.clip(t / d, 0, 1))
    forms = G.vowel_track(n, [(0, "a"), (d * 0.6, "e" if happy else "A"), (d, "a")])
    amp = np.clip(t / 0.03, 0, 1) * np.clip((d - t) / 0.06, 0, 1) * (0.75 if happy else 0.5)
    y = G.vox(f0, forms, amp, r, r.uniform(1.35, 1.5), tilt=1.1, breath=0.25, fmax=4200)
    return y


def _laugh(r):
    n = ns(0.7)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, tm in enumerate([0.0, 0.17, 0.33]):
        d = 0.12
        nn = ns(d)
        tt_ = np.arange(nn) / SR
        f0 = r.uniform(150, 190) * (1.05 - 0.15 * k / 3) * np.ones(nn)
        forms = G.vowel_track(nn, [(0, "a"), (d, "ae")])
        amp = np.clip(tt_ / 0.01, 0, 1) * np.clip((d - tt_) / 0.03, 0, 1) * (1 - 0.2 * k)
        _put(y, G.vox(f0, forms, amp, r, 1.0, tilt=1.2, breath=0.4), ns(tm))
    return y


def _call(r):
    """a navvy's shout down a tunnel: one open vowel, pushed, then swallowed"""
    d = r.uniform(0.55, 0.75)
    n = ns(d)
    t = np.arange(n) / SR
    f0 = r.uniform(120, 165) * np.interp(t, [0, d * 0.25, d], [1.15, 1.3, 0.85])
    forms = G.vowel_track(n, [(0, "A"), (d * 0.5, "a"), (d, "er")])
    amp = np.clip(t / 0.02, 0, 1) * np.clip((d - t) / 0.12, 0, 1)
    y = G.vox(f0, forms, amp, r, 1.0, tilt=1.0, breath=0.5, fmax=3800)
    return lp(y, 3000, 1)


def _breath_cloth(r, out=False):
    """breath pulled through a handkerchief: no high end, cloth flutter on the way"""
    d = 0.55 if not out else 0.65
    n = ns(d)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    x = bp(nz, 300, 1900, 1)
    env = np.clip(t / (0.16 if not out else 0.05), 0, 1) * np.clip((d - t) / (0.1 if not out else 0.3), 0, 1)
    env *= 0.7 + 0.3 * smooth_noise(n, r, 14.0)
    x *= env
    cloth = bp(r.standard_normal(n), 900, 3200, 1) * env * 0.12
    return x + cloth


def _breath_clean(r):
    """the first open breath in the film: full-band, smooth, unhurried"""
    d = 0.85
    n = ns(d)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    x = bp(nz, 220, 6500, 1)
    env = np.clip(t / 0.22, 0, 1) ** 1.4 * np.clip((d - t) / 0.3, 0, 1) ** 1.2
    x *= env
    air = hp(nz, 4000) * env * 0.18
    return x + air


def _cloth(r, amount=0.5):
    """linen dragged across a face: a soft, granular swish with a little body"""
    d = 0.45 + 0.35 * amount
    n = ns(d)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    grain = 0.5 + 0.5 * smooth_noise(n, r, 26.0)
    swish = bp(nz, 600, 4200, 1) * grain
    env = np.clip(t / 0.08, 0, 1) * np.clip((d - t) / 0.18, 0, 1) ** 1.3
    y = swish * env * amount
    y += bp(nz, 180, 700, 1) * env * 0.15 * amount
    return y


def _cloth_away(r):
    """one clean flick as the handkerchief is pulled off"""
    d = 0.5
    n = ns(d)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    flick = bp(nz, 800, 7000, 1) * np.exp(-t / 0.012)
    flap = bp(nz, 400, 3000, 1) * np.clip(t / 0.01, 0, 1) * np.exp(-t / 0.09) * 0.5
    return fades(flick * 0.9 + flap, 0.001, 0.1)


def _cough(r, muffled=True):
    d = r.uniform(0.35, 0.5)
    n = ns(d)
    t = np.arange(n) / SR
    burst = _noise_burst(d, r, 200, 2200, 0.045, 0.004)
    voice = modal(d, [(r.uniform(110, 150), 1.0, 0.05), (r.uniform(240, 320), 0.6, 0.03)], r) * 0.6
    y = burst + voice
    if muffled:
        y = lp(y, 1400, 2)
    return y


# ================================================================ objects
def _carriage(r):
    """hooves and iron-tyred wheels passing on setts, heard through glass"""
    d = 2.6
    n = ns(d)
    y = np.zeros(n)
    tm = 0.0
    while tm < d - 0.3:
        s = _stone_step(r, r.uniform(0.5, 1.0))
        _put(y, s, ns(tm))
        tm += r.uniform(0.28, 0.42)
    t = np.arange(n) / SR
    rum = bp(colored(n, r, 1.6), 60, 400, 1) * (0.4 + 0.6 * np.sin(np.pi * t / d) ** 2) * 0.8
    y = lp(y * 0.6 + rum, 1800, 2)
    return y * np.clip(np.sin(np.pi * t / d), 0, 1) ** 0.5


def _cart(r):
    """a cart on cobbles: wooden wheel clatter with a loose iron rim"""
    d = 1.8
    n = ns(d)
    y = np.zeros(n)
    tm = 0.0
    while tm < d - 0.2:
        _put(y, _stone_step(r, r.uniform(0.3, 0.7)), ns(tm))
        if r.uniform() < 0.35:
            _put(y, G.clink(r, r.uniform(2200, 3400), 0.08) * 0.35, ns(tm + r.uniform(0.01, 0.05)))
        tm += r.uniform(0.14, 0.24)
    t = np.arange(n) / SR
    y += bp(colored(n, r, 1.2), 120, 1200, 1) * 0.25 * np.clip(np.sin(np.pi * t / d), 0, 1) ** 0.5
    return lp(y, 4200, 1)


def _oar(r):
    d = 0.9
    t = tt(d)
    creak = modal(d, [(r.uniform(380, 560), 0.5, 0.05), (r.uniform(900, 1400), 0.3, 0.03)], r)
    swish = bp(r.standard_normal(ns(d)), 500, 4000, 1) * np.clip(t / 0.1, 0, 1) * np.exp(-t / 0.25) * 0.4
    return fades(creak + swish, 0.01, 0.2)


def _gull(r):
    d = r.uniform(0.5, 0.7)
    n = ns(d)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(r.integers(2, 4)):
        dd = r.uniform(0.13, 0.2)
        nn = ns(dd)
        tl = np.arange(nn) / SR
        f = r.uniform(1300, 1900) * (1 - 0.45 * tl / dd)
        c = np.sin(phase(f)) * np.sin(np.pi * tl / dd) ** 1.2
        _put(y, c, ns(k * r.uniform(0.16, 0.22)))
    return y


def _bubble(r, scale=0.6):
    d = 0.7
    y = G.bubbles(d, r, 22, 90, 700, (0.015, 0.05), None, rise=(2, 6)) * 0.9
    y += lp(r.standard_normal(ns(d)), 300, 2) * np.exp(-tt(d) / 0.12) * 0.15
    return fades(y * scale, 0.005, 0.15)


def _slurp(r):
    d = 0.8
    n = ns(d)
    t = np.arange(n) / SR
    nz = bp(colored(n, r, 1.0), 120, 900, 1)
    env = np.clip(t / 0.12, 0, 1) * np.exp(-np.maximum(t - 0.2, 0) / 0.2)
    return nz * env * 0.6


def _bell_strikes(r, n_hits, gap):
    """a distant church bell: hum, prime, tierce, quint, nominal"""
    d = 3.4
    t = tt(d)
    y = np.zeros(ns(d))
    for k in range(n_hits):
        f0 = r.uniform(190, 240)
        md = [(f0 * 0.5, 0.7, 1.6), (f0, 1.0, 1.2), (f0 * 1.2, 0.5, 0.9), (f0 * 1.5, 0.35, 0.7),
              (f0 * 2.0, 0.45, 0.55), (f0 * 2.5, 0.2, 0.35), (f0 * 3.0, 0.15, 0.25)]
        b = modal(d, md, r)
        b += bp(r.standard_normal(ns(d)), 800, 6000, 1) * np.exp(-t / 0.004) * 0.25
        _put(y, b * (1.0 - 0.12 * k), ns(k * gap))
    return lp(fades(y, 0.002, 0.4), 4200, 1)


def _bell_vote(r):
    d = 1.4
    y = np.zeros(ns(d))
    for k in range(2):
        f0 = r.uniform(620, 700)
        b = modal(0.9, [(f0, 1.0, 0.5), (f0 * 2.76, 0.5, 0.3), (f0 * 5.4, 0.25, 0.15), (f0 * 8.9, 0.12, 0.08)], r)
        b += hp(r.standard_normal(ns(0.9)), 3000) * np.exp(-tt(0.9) / 0.003) * 0.3
        _put(y, b, ns(k * 0.42))
    return y


def _gavel(r):
    return _wood_knock(0.35, r, 200, 700, 0.4)


def _gavel_big(r):
    """the 'three million pounds' thump: deep, dry, parliamentary, with the room answering"""
    d = 1.5
    t = tt(d)
    body = modal(d, [(r.uniform(75, 95), 1.0, 0.22), (r.uniform(140, 175), 0.7, 0.14),
                     (r.uniform(300, 380), 0.35, 0.07)], r)
    click = bp(r.standard_normal(ns(d)), 500, 5000, 1) * np.exp(-t / 0.004) * 0.7
    return fades(body * 1.4 + click, 0.0, 0.2)


def _papers(r, hard=False):
    d = 0.8 if hard else 0.6
    n = ns(d)
    y = np.zeros(n)
    for k in range(14 if hard else 9):
        b = _noise_burst(0.09, r, 1200, 8000, r.uniform(0.006, 0.014))
        _put(y, b * r.uniform(0.2, 0.8), ns(r.uniform(0, d * 0.55)))
    if hard:
        _put(y, _wood_knock(0.25, r, 120, 400, 0.3) * 0.8, 0)
    return y


def _door(r):
    d = 0.9
    t = tt(d)
    thud = lp(r.standard_normal(ns(d)), 300, 2) * np.exp(-t / 0.05) * 1.2
    latch = modal(0.3, [(r.uniform(1400, 2200), 0.4, 0.02), (r.uniform(2800, 4000), 0.25, 0.01)], r)
    y = thud.copy()
    _put(y, latch, ns(0.05))
    return fades(y, 0.0, 0.2)


def _bucket_down(r, soft=False):
    d = 0.7
    y = _wood_knock(d, r, 130, 420, 0.25) * (0.5 if soft else 1.0)
    if not soft:
        y += G.bubbles(d, r, 25, 150, 900, (0.01, 0.04), np.exp(-tt(d) / 0.2)) * 0.35
    return y


def _pour(r):
    """water tipped from a bucket: a falling, chattering band"""
    d = 1.1
    n = ns(d)
    t = np.arange(n) / SR
    nz = r.standard_normal(n)
    centre = 1500 * np.exp(-t / 0.7) + 300
    y = bp(nz, 250, 2600, 1)
    y *= (0.6 + 0.4 * smooth_noise(n, r, 20.0))
    y *= np.clip(t / 0.08, 0, 1) * np.clip((d - t) / 0.25, 0, 1)
    y += G.bubbles(d, r, 120, 200, 1400, (0.006, 0.02), np.clip(t / 0.1, 0, 1) * np.clip((d - t) / 0.3, 0, 1)) * 0.4
    return y


def _ladle(r):
    d = 0.5
    y = G.clink(r, r.uniform(900, 1300), 0.2) * 0.7
    y = np.pad(y, (0, ns(d) - len(y)))
    y += G.bubbles(d, r, 40, 200, 1200, (0.006, 0.02), np.exp(-tt(d) / 0.12)) * 0.3
    return y


def _lap(r):
    d = 0.8
    t = tt(d)
    nz = r.standard_normal(ns(d))
    y = bp(nz, 200, 1800, 1) * np.clip(t / 0.12, 0, 1) * np.exp(-t / 0.18)
    y += G.bubbles(d, r, 30, 200, 1200, (0.006, 0.02), np.exp(-t / 0.2)) * 0.3
    return y


def _drip(r):
    d = 0.9
    f0 = r.uniform(900, 1800)
    y = np.exp(-tt(d) / 0.03) * np.sin(phase(f0 * (1 + 6 * tt(d))))
    return fades(y * 0.6, 0.0, 0.2)


def _pick(r):
    """pickaxe into brick: sharp steel tick, then the brick's dull body"""
    d = 0.9
    t = tt(d)
    tick = hp(r.standard_normal(ns(d)), 2500) * np.exp(-t / 0.0018) * 1.1
    body = modal(d, [(r.uniform(160, 240), 0.8, 0.06), (r.uniform(380, 560), 0.5, 0.04),
                     (r.uniform(900, 1400), 0.25, 0.02)], r)
    crumble = _noise_burst(0.4, r, 600, 5000, 0.09, 0.01) * 0.35
    y = tick + body
    _put(y, crumble, ns(0.06))
    return fades(y, 0.0, 0.15)


def _shovel(r):
    """a shovel scraping brick rubble and loading it"""
    d = 1.0
    n = ns(d)
    t = np.arange(n) / SR
    scrape = bp(r.standard_normal(n), 700, 5200, 1) * (0.4 + 0.6 * smooth_noise(n, r, 9.0))
    env = np.clip(t / 0.1, 0, 1) * np.clip((d - t) / 0.25, 0, 1)
    y = scrape * env * 0.6
    _put(y, _noise_burst(0.3, r, 300, 2500, 0.06) * 0.4, ns(0.55))
    return y


def _lantern(r):
    d = 1.2
    n = ns(d)
    t = np.arange(n) / SR
    hiss = hp(r.standard_normal(n), 3500, 1) * (0.5 + 0.5 * smooth_noise(n, r, 12.0))
    return hiss * np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.3, 0, 1) * 0.5


# ================================================================ air / water / places
def _air_swell(dur, r, bright=800, level=1.0):
    """a gust through stone: shaped noise, no pitch, a little body"""
    n = ns(dur)
    t = np.arange(n) / SR
    nz = colored(n, r, 1.0)
    y = lp(nz, bright, 2) * (0.6 + 0.4 * smooth_noise(n, r, 1.2))
    y += 0.2 * bp(nz, bright, bright * 3.5, 1) * (0.5 + 0.5 * smooth_noise(n, r, 2.0))
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return y * env * level


def _sludge_swell(dur, r, bright=700):
    """the river rising on a word: slow, thick, low, bubbling under — no clean-water sparkle"""
    n = ns(dur)
    t = np.arange(n) / SR
    y = lp(colored(n, r, 2.0), 110, 2) * 0.9
    y += bp(colored(n, r, 1.4), 70, bright, 1) * (0.5 + 0.5 * smooth_noise(n, r, 0.8)) * 0.7
    y += G.bubbles(dur, r, 16, 70, 600, (0.02, 0.06), np.sin(np.pi * t / dur) ** 2, rise=(2, 6)) * 0.45
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.3
    return fades(y * env, 0.08, 0.35)


def _water_far(dur, r):
    n = ns(dur)
    y = bp(colored(n, r, 1.2), 100, 1200, 1) * (0.6 + 0.4 * smooth_noise(n, r, 0.6))
    y += G.bubbles(dur, r, 8, 150, 800, (0.01, 0.04)) * 0.3
    return lp(y, 1400, 1)


def _river_open(dur, r):
    """the clean, wide river: flow, gentle laps, no sludge"""
    n = ns(dur)
    out = np.zeros((2, n))
    for ch in range(2):
        flow = bp(colored(n, r, 0.8), 150, 3000, 1) * (0.7 + 0.3 * smooth_noise(n, r, 0.5))
        out[ch] = flow * 0.5
    tm = 0.3
    while tm < dur - 0.6:
        l = _lap(r) * r.uniform(0.4, 0.9)
        place(out, pan(l, r.uniform(-0.8, 0.8)), tm)
        tm += r.uniform(0.7, 1.4)
    out += widen(G.bubbles(dur, r, 30, 300, 2000, (0.005, 0.02)) * 0.25, r, 9, 0.8)
    return fades(out, 0.3, 0.5)


def _room_open(dur, r):
    """the chamber after the handkerchief: normal air, a window, life outside, no muffling"""
    n = ns(dur)
    x = G.breeze(dur, r, 0.5, 0.2, 1400)
    x += st(lp(colored(n, r, 1.0), 500, 2) * 0.15)
    x += pan(_murmur_far(dur, r, 5, (110, 200), 3200) * 0.25, 0.4)
    x += pan(_birds(dur, r, 0.4, "sparrow") * 0.06, -0.5)
    return fades(x, 0.12, 0.4)


def _market(dur, r):
    n = ns(dur)
    x = _murmur_far(dur, r, 12, (110, 250), 3600) * 0.6
    x += _murmur_far(dur, r, 3, (280, 340), 4000) * 0.2
    out = widen(x, r, 13, 0.8)
    out += pan(_birds(dur, r, 0.5, "sparrow") * 0.12, -0.5)
    out += pan(_birds(dur, r, 0.3, "sparrow") * 0.08, 0.6)
    return fades(out, 0.2, 0.5)


def _steps(r):
    d = 2.2
    out = np.zeros((2, ns(d)))
    tm = 0.0
    pan_p = -0.7
    while tm < d - 0.3:
        s = _stone_step(r, r.uniform(0.5, 1.0))
        place(out, pan(s, pan_p), tm)
        pan_p = min(0.7, pan_p + 0.12)
        tm += r.uniform(0.42, 0.56)
    return fades(out, 0.05, 0.2)


def _birds(dur, r, density, kind):
    """bird_chirps can start late, so render long and trim the leading silence — a 2 s cue must not come back empty"""
    y = G.bird_chirps(dur + 1.6, r, density, kind)
    nz = np.flatnonzero(np.abs(y) > 1e-6)
    if len(nz) == 0:
        return np.zeros(ns(dur))
    y = y[nz[0]:]
    y = np.pad(y, (0, max(0, ns(dur) - len(y))))[: ns(dur)]
    return y


def _sparrows(r):
    return widen(_birds(2.0, r, 1.2, "sparrow"), r, 10, 0.8)


def _bird_lone(r, bright=False):
    y = _birds(2.2, r, 0.9, "blackbird")
    if bright:
        y = shelf(y, 2500, 3.0, "high")
    return fades(y, 0.05, 0.4)


def _tunnel_in(dur, r):
    """the tunnel takes the sound: a deep enclosed bloom with a long dark tail baked in"""
    n = ns(dur)
    t = np.arange(n) / SR
    base = lp(colored(n, r, 2.0), 120, 2) * 0.9
    base += bp(colored(n, r, 1.0), 120, 900, 1) * 0.25
    base *= np.clip(t / 0.8, 0, 1) * np.clip((dur - t) / 0.8, 0, 1)
    wet = convolve_st(base, make_ir(2.8, 7, pre=0.03, hf=0.5, early=[(0.07, 0.3, -0.6), (0.11, 0.25, 0.6)]))
    y = st(base) * 0.5 + wet * 0.8
    return fades(y, 0.5, 0.7)


# ================================================================ ambience beds
def _bed_room(dur, seed):
    """Parliament at an open window: airless stone-room tone, street through glass, a fly"""
    r = rng(seed)
    n = ns(dur)
    out = np.zeros((2, n))
    tone = lp(colored(n, r, 1.6), 200, 2) * 0.5 + lp(colored(n, r, 0.8), 800, 2) * 0.06
    out += st(tone)
    rum = lp(colored(n, r, 2.0), 120, 2) * (0.5 + 0.5 * smooth_noise(n, r, 0.5))
    out += pan(rum * 0.7, -0.3)
    fly = np.zeros(n)
    for k in range(4):
        L = r.uniform(0.4, 0.9)
        seg = np.arange(ns(L)) / SR
        bz = np.sin(TAU * r.uniform(170, 230) * seg + 3 * np.sin(TAU * r.uniform(4, 8) * seg))
        bz *= np.sin(np.pi * seg / L) ** 2
        _put(fly, bz, ns(r.uniform(0, dur - L)))
    out += widen(fly * 0.04, r, 9, 0.5)
    return out


def _bed_reveal(dur, seed):
    """the first smell: wet, low, ugly river air under distant London"""
    r = rng(seed)
    n = ns(dur)
    x = G.breeze(dur, r, 0.7, 0.2, 650)
    x += st(lp(colored(n, r, 2.0), 140, 2) * 0.45)
    wet = bp(colored(n, r, 1.3), 80, 900, 1) * (0.6 + 0.4 * smooth_noise(n, r, 0.6))
    x += st(wet * 0.6)
    x += pan(G.bubbles(dur, r, 12, 110, 800, (0.01, 0.05)) * 0.35, -0.2)
    x += pan(_murmur_far(dur, r, 9) * 0.35, 0.3)
    x += pan(_birds(dur, r, 0.25, "sparrow") * 0.05, -0.5)
    return fades(x, 0.5, 0.6)


def _bed_city(dur, seed):
    """London from above: carts, distant voices, chimney draught, sparrows"""
    r = rng(seed)
    n = ns(dur)
    x = G.breeze(dur, r, 0.5, 0.25, 600)
    x += st(lp(colored(n, r, 1.8), 160, 2) * 0.35)
    out = np.zeros((2, n))
    tm = 0.2
    while tm < dur - 1.6:
        c = _cart(r) * r.uniform(0.35, 0.8)
        place(out, pan(c, r.uniform(-0.85, 0.85)), tm)
        tm += r.uniform(0.9, 2.0)
    out += x
    out += pan(_murmur_far(dur, r, 8, fmax=2200) * 0.28, 0.0)
    out += pan(_birds(dur, r, 0.35, "sparrow") * 0.07, -0.6)
    return fades(out, 0.4, 0.5)


def _bed_sludge(dur, seed):
    """close, thick, slow: the river as it actually is. No sparkle anywhere"""
    r = rng(seed)
    n = ns(dur)
    out = np.zeros((2, n))
    for ch in range(2):
        flow = bp(colored(n, r, 1.6), 60, 700, 1) * (0.6 + 0.4 * smooth_noise(n, r, 0.35))
        rum = lp(colored(n, r, 2.2), 90, 2) * 0.5
        out[ch] = flow * 0.6 + rum
    tm = 0.2
    while tm < dur - 1.0:
        b = G.bubbles(r.uniform(0.5, 1.2), r, 14, 80, 600, (0.02, 0.06), rise=(2, 5)) * r.uniform(0.2, 0.5)
        place(out, pan(b, r.uniform(-0.8, 0.8)), tm)
        tm += r.uniform(0.6, 1.5)
    return fades(out, 0.4, 0.5)


def _bed_chamber(dur, seed):
    """muffled chamber: handkerchiefed hubbub, coughing, cloth, a big close room"""
    r = rng(seed)
    n = ns(dur)
    out = np.zeros((2, n))
    out += widen(lp(_murmur_far(dur, r, 14, (95, 230), 2200), 900, 1), r, 12, 0.6)
    out += st(lp(colored(n, r, 1.2), 300, 2) * 0.12)
    tm = 0.4
    while tm < dur - 0.8:
        c = _cough(r, muffled=True) * r.uniform(0.25, 0.6)
        place(out, pan(c, r.uniform(-0.7, 0.7)), tm)
        tm += r.uniform(0.9, 1.9)
    cl = _cloth(r, 0.5) * 0.3
    place(out, pan(cl, 0.2), r.uniform(0.5, 1.5))
    return fades(out, 0.3, 0.4)


def _bed_empty(dur, seed):
    """the emptied terrace: wind through the arches, a resonant draught, nothing else"""
    r = rng(seed)
    n = ns(dur)
    x = G.breeze(dur, r, 0.9, 0.35, 900)
    x += st(lp(colored(n, r, 1.4), 220, 2) * 0.25)
    # the arches: a couple of resonant bands that ring when the gust passes
    arch = bp(colored(n, r, 0.8), 180, 520, 3) * (0.4 + 0.6 * smooth_noise(n, r, 0.4))
    x += widen(arch * 0.5, r, 14, 0.7)
    return fades(x, 0.4, 0.6)


def _bed_intake(dur, seed):
    """the water's edge: the same river close by, low voices, bank air"""
    r = rng(seed)
    n = ns(dur)
    out = G.water_bed(dur, r, 0.8, 0.7)
    out = lp(out, 2200, 1) * 0.8
    out += G.breeze(dur, r, 0.3, 0.15, 700)
    out += pan(_murmur_far(dur, r, 7, fmax=2400) * 0.35, -0.2)
    return fades(out, 0.4, 0.5)


def _bed_debate(dur, seed):
    """a crowded chamber: many voices arguing, papers, benches"""
    r = rng(seed)
    n = ns(dur)
    out = widen(lp(_murmur_far(dur, r, 20, (90, 220), 3400), 3800, 1), r, 13, 0.8)
    out += widen(lp(_murmur_far(dur, r, 6, (150, 280), 4000), 4000, 1) * 0.6, r, 9, 0.7)
    tm = 0.5
    while tm < dur - 0.6:
        place(out, pan(_papers(r) * r.uniform(0.2, 0.5), r.uniform(-0.7, 0.7)), tm)
        tm += r.uniform(0.8, 1.6)
    bench = modal(dur, [(70, 0.4, 1.5), (110, 0.3, 1.0)], r) * 0.15
    out += widen(bench, r, 15, 0.6)
    return fades(out, 0.3, 0.4)


def _bed_tunnel(dur, seed):
    """inside the brick tunnel: deep enclosed rumble, far water, drips, a long dark reverb"""
    r = rng(seed)
    n = ns(dur)
    base = lp(colored(n, r, 2.2), 110, 2) * 0.7
    base += bp(colored(n, r, 1.4), 120, 1000, 1) * (0.25 + 0.15 * smooth_noise(n, r, 0.4))
    base *= 0.8
    wet = convolve_st(base, make_ir(2.6, seed + 3, pre=0.02, hf=0.55))
    out = st(base) * 0.35 + wet * 0.9
    # far water and drips, already wet
    tm = 0.5
    while tm < dur - 1.0:
        d = _drip(r) * r.uniform(0.2, 0.6)
        place(out, pan(d, r.uniform(-0.8, 0.8)), tm)
        tm += r.uniform(0.9, 2.2)
    return fades(out, 0.6, 0.6)


def _bed_close(dur, seed):
    """close and muffled: a man breathing through cloth, the room pressed flat"""
    r = rng(seed)
    n = ns(dur)
    out = np.zeros((2, n))
    tm = 0.25
    while tm < dur - 1.0:
        b = _breath_cloth(r) * r.uniform(0.5, 0.9)
        place(out, pan(b, r.uniform(-0.25, 0.25)), tm)
        tm += r.uniform(1.0, 1.4)
    out += st(lp(colored(n, r, 1.4), 260, 2) * 0.12)
    out += widen(lp(_murmur_far(dur, r, 4, fmax=1600) * 0.2, 700, 1), r, 10, 0.5)
    return fades(out, 0.2, 0.15)


def _bed_alive(dur, seed):
    """the room suddenly normal: birds, market air, people, warm and open"""
    r = rng(seed)
    n = ns(dur)
    x = G.breeze(dur, r, 0.45, 0.2, 1500)
    x += st(lp(colored(n, r, 1.0), 600, 2) * 0.12)
    out = widen(_murmur_far(dur, r, 11, (110, 250), 3800) * 0.4, r, 13, 0.8)
    out += x
    out += pan(_birds(dur, r, 0.55, "sparrow") * 0.1, -0.55)
    out += pan(_birds(dur, r, 0.4, "sparrow") * 0.07, 0.6)
    out += pan(_birds(dur, r, 0.2, "blackbird") * 0.05, 0.15)
    return fades(out, 0.25, 0.5)


def _bed_gold(dur, seed):
    """the river clean and wide: open flow, gentle laps, air over water"""
    r = rng(seed)
    n = ns(dur)
    out = np.zeros((2, n))
    for ch in range(2):
        flow = bp(colored(n, r, 0.8), 140, 3200, 1) * (0.6 + 0.4 * smooth_noise(n, r, 0.45))
        out[ch] = flow * 0.5
    out += G.breeze(dur, r, 0.35, 0.15, 1200)
    tm = 0.4
    while tm < dur - 0.7:
        place(out, pan(_lap(r) * r.uniform(0.25, 0.6), r.uniform(-0.8, 0.8)), tm)
        tm += r.uniform(0.8, 1.5)
    return fades(out, 0.35, 0.5)


def _bed_wide(dur, seed):
    """the final pull-back: wide distant air, a low city, wind"""
    r = rng(seed)
    n = ns(dur)
    x = G.breeze(dur, r, 0.8, 0.3, 700)
    x += st(lp(colored(n, r, 2.0), 120, 2) * 0.35)
    out = x
    out += widen(lp(_murmur_far(dur, r, 6, fmax=1800) * 0.18, 1200, 1), r, 18, 0.9)
    return fades(out, 0.5, 0.8)


# ================================================================ render
def render(v_ref, on_event=None):
    """v_ref = integrated loudness of the voice stem (stereo). Returns (stereo stem, cue list with measured levels).
    on_event(cue, x, t0) is called with every placed (dry) event, for analysis."""
    C = cues()
    out = np.zeros((2, N))
    send = np.zeros(N)
    for c in C:
        x, anchor = c.gen()
        x = np.asarray(x, float)
        x = pan(x, c.p) if x.ndim == 1 else x
        if c.cut is not None:
            k = ns(c.cut - (c.t - anchor))
            if 0 < k < x.shape[1]:
                x = fades(x[:, :k], 0.0, 0.02)
        tgt = v_ref + c.applied
        cur = momentary_max(x) if c.kind == "event" else integrated(x)
        if np.isfinite(cur):
            x = x * dbg(tgt - cur)
        if c.lpf:
            x = lp(x, c.lpf, 1)
        c.measured = momentary_max(x) - v_ref if c.kind == "event" else integrated(x) - v_ref
        t0 = c.t - anchor
        place(out, x, t0)
        if on_event:
            on_event(c, x, t0)
        if c.send > 0:
            G._place_mono(send, c.send * x.mean(0), t0)
    # one room: stone and wood, moderately live, darker than the bridge's valley
    room = make_ir(1.45, 1858, pre=0.014, hf=1.25, early=[(0.06, 0.4, -0.55), (0.11, 0.28, 0.6), (0.19, 0.18, -0.2)])
    out += 0.5 * convolve_st(send, room)
    out = hp(out, 25, 2)
    end = ns(T.DUR - 0.12)
    out[:, end:] *= np.linspace(1, 0, N - end)[None, :] ** 2
    return out, C
