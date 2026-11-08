// Timeline of "The Great Stink": shots timed to the voice words (voice/words.json), and the camera
// grammar measured in the reference study: continuous slow push-ins; symmetric ease-in-out moves;
// big reframes are cuts; impacts are 7-frame kicks that flip sign every frame; no hand-held float.
//
// The film is 1877 frames = 62.567 s. Every shot boundary below is anchored to a measured word
// onset from the Andrew voice track, not to a round number — the picture must land on the word.
export const FPS = 30;
export const TOTAL = 1877;
export const D0 = 6.0; // terrace height above the water; MUST match parliament.ts
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// ---------------- shots ----------------
// Boundons from voice/words.json (seconds x 30). Measured sentence onsets:
//   0.07 standing | 2.57 July 1858 | 7.61 two and a half million | 12.86 The Thames
//   14.63 untreated sewage | 18.68 curtains in lime | 23.81 Great Stink | 28.00 drinking
//   32.93 decades of refusing | 36.29 three million | 38.56 Bazalgette | 45.09 makes no sense
//   49.09 foul air | 52.32 sewers worked | 56.00 already been beaten | 61.28 saved by a mistake
export type Light = "day" | "golden";
export type Crowd = "none" | "mps" | "folk" | "debate" | "intake" | "bazalgette" | "labourers" | "sick";
export type ShotDef = {
  id: number; a: number; b: number; light: Light; crowd: Crowd;
  /** per-shot sun override: azimuth in degrees from the shot camera's forward axis, elevation */
  sunAz?: number; sunEl?: number;
};
export const SHOTS: ShotDef[] = [
  // 1. "standing inside the British Parliament / cannot breathe" — at the open window, looking out
  { id: 1, a: 0, b: 77, light: "day", crowd: "none", sunAz: 60, sunEl: 40 },
  // 2. "July 1858 ... tastes like a sewer / Because it is one" — the reveal: palace + sludge river
  { id: 2, a: 77, b: 220, light: "day", crowd: "none", sunAz: 130, sunEl: 34 },
  // 3. "two and a half million people ... cesspits and drains" — the city from above
  { id: 3, a: 220, b: 344, light: "day", crowd: "none", sunAz: 100, sunEl: 46 },
  // 4. "empties into a single river. The Thames." — down on the water
  { id: 4, a: 344, b: 407, light: "day", crowd: "none", sunAz: 20, sunEl: 30 },
  // 5. "not water anymore ... built directly beside it" — low over the sludge at the Palace
  { id: 5, a: 407, b: 560, light: "day", crowd: "none", sunAz: 70, sunEl: 28 },
  // 6. "curtains in lime / handkerchiefs ... St Albans" — the Members on the terrace
  { id: 6, a: 560, b: 706, light: "day", crowd: "mps", sunAz: 95, sunEl: 38 },
  // 7. "Great Stink, strong enough to empty a debating chamber" — the empty terrace
  { id: 7, a: 706, b: 840, light: "day", crowd: "none", sunAz: 120, sunEl: 40 },
  // 8. "drinking from that same river ... cholera" — the water's edge
  { id: 8, a: 840, b: 988, light: "day", crowd: "intake", sunAz: 40, sunEl: 34 },
  // 9. "decades of refusing to pay / borrow three million pounds in eighteen days" — the debate
  { id: 9, a: 988, b: 1148, light: "day", crowd: "debate", sunAz: 85, sunEl: 36 },
  // 10. "Bazalgette ... eighty two miles of brick tunnels ... street sewers" — INSIDE THE SEWER
  { id: 10, a: 1148, b: 1353, light: "golden", crowd: "labourers", sunAz: 8, sunEl: 10 },
  // 11. "part that makes no sense / smell itself was the poison. It was not." — close on a Member
  { id: 11, a: 1353, b: 1464, light: "day", crowd: "mps", sunAz: 90, sunEl: 40 },
  // 12. "foul air was not spreading disease ... no cholera outbreak" — people breathing, alive
  { id: 12, a: 1464, b: 1646, light: "day", crowd: "folk", sunAz: 110, sunEl: 42 },
  // 13. "sewers worked anyway ... carried the filth out ... the smell with it" — the river, golden
  { id: 13, a: 1646, b: 1752, light: "golden", crowd: "none", sunAz: 15, sunEl: 9 },
  // 14. "cholera had already been beaten ... intakes upstream / saved by a mistake" — final pull-back
  { id: 14, a: 1752, b: TOTAL, light: "golden", crowd: "none", sunAz: 25, sunEl: 11 },
];

/** crossfades (frames) at place/time changes; a white 4-frame flash where the reveal lands */
export const XFADE: Record<number, number> = { 2: 8, 10: 10, 13: 8, 14: 8 };
export const FLASH_AT = 77;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
/** layers to draw at frame f: base shot, plus the next shot fading in during a crossfade */
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
// Grammar (motion.md): every move is a symmetric smootherstep glide of 18-40 f; a reframe bigger than
// about half a frame width or 40 % zoom is a hard cut on its key frame. Holds push in (dolly toward the
// look point or a fov zoom near walls): 0.15-0.35 %/f, ~0.6 %/f for ~35 f on the punch words. Rolls of
// 4-8 deg over >= 18 f on emphasis beats, held tilt <= 0.07 rad.
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
/** reference camera ease: symmetric smootherstep (attack = release, ~10 f each on a 23 f move) */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
/** pull-back factor since f0 (> 1 = further away), for the final crane out */
const pullK = (f: number, f0: number, rate: number) => Math.exp(rate * Math.max(0, f - f0));
/** dolly push: camera slides toward the look point by factor k */
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });

// ---- framings (f -> camera); each pushes in from the frame its key starts ----
//
// GEOMETRY FIRST. The frame is 1080x1920 portrait, so three.js `fov` is VERTICAL and the
// horizontal field is only about 0.56 of it: fov 46 gives a 27-degree-wide window. That single
// fact decides every camera in this film:
//
//   * a 1.8 m person fills 40 % of the frame height only from about 6 m away;
//   * a group spanning 10 m needs about 20 m of distance at fov 55;
//   * therefore crowd shots are made from OVER THE RIVER, looking back at the terrace, and
//     close-ups are made from ON the terrace, 5-8 m from the face.
//
// The terrace runs z = 30 (parapet) .. 48 (palace front), so a camera between those numbers is
// standing on the terrace and anything below 30 is over the water. The palace front is a flat
// 26 m wall: any camera pointed at it from further than ~20 m renders stone, so every shot that
// needs the palace keeps the river or the cast in front of it.
// Shot 1 is the only INTERIOR in the film, and it is built to the line: "you are standing
// inside the British Parliament, and you cannot breathe." The window is the whole point — it is
// the only light, and through it is the river, which is the thing the room cannot escape.
//
// The camera stands at the BACK of the room (z = 46, against the back wall at 47) and looks
// the length of the chamber at the glass at z = 31. That 15 m is the shot: it is what puts the
// benches, the aisle and the window in one frame. An earlier version stood at z = 35, four
// metres from the glass and inside the bench rows, so the opening filled the entire frame and
// the room — the thing the line is about — was behind the camera.
//
// y = 9.5 is 3.5 m above the floor. At standing height the benches eat the bottom third; higher
// and the sill cuts the river out of the glass. Measured with tools/sightlines.mjs: benches
// 35 %, wall 30 %, water 10 %, sky 15 %, mullion 10 %.
const CH = { CX: -150, Z1: 47, Z0: 31 };
const S1a = (f: number) => dolly([CH.CX, 9.5, CH.Z1 - 1], [CH.CX, 7.5, CH.Z0], pushK(f, 0, 0.0016), { fov: 58 });
const S1b = (f: number) => dolly([CH.CX + 0.8, 9.3, CH.Z1 - 2], [CH.CX - 0.3, 7.3, CH.Z0 + 1], pushK(f, 40, 0.0019), { fov: 54, roll: -0.015 });
// Shot 2: the reveal — the Palace from across the river, water in the foreground
const S2a = (f: number) => dolly([0, 26, -26], [0, 13, 48], pushK(f, 77, 0.0016), { fov: 46 });
const S2b = (f: number) => dolly([-7, 23, -38], [2, 15, 48], pushK(f, 140, 0.0016), { fov: 44, roll: 0.015 });
// Shot 3: the city from above — the far bank's roofs and chimneys, the river beyond
// Shot 3 is "two and a half million people ... empties into a single river." The old framing was
// 40 m up over the far bank looking DOWN at rooftops: 50 % of the frame was one roof plane and
// the river was 1 %. The city without the river is the wrong picture — the sentence is about the
// city draining INTO the water. So the camera is now 55 m up and back on the far side, looking
// across the rooftops at the Thames: 26 % tower, 22 % water, 15 % wall, 31 % sky, mean depth 123 m.
const S3a = (f: number) => dolly([-100, 55, -65], [50, -2, 5], pushK(f, 220, 0.0013), { fov: 50 });
const S3b = (f: number) => dolly([-115, 50, -50], [35, -2, 15], pushK(f, 280, 0.0015), { fov: 52, roll: -0.015 });
// Shot 4: down on the water — "The Thames. It is not water anymore."
// Shot 4 is "The Thames. It is not water anymore." The old camera stood on the terrace and
// looked ACROSS the river, which put 40 % embankment wall in the frame and made the water a
// distant brown band. Now it skims the surface looking ALONG the river: 47 % water, 44 % sky,
// 8 % wall, and a third of the frame within 6 m, which is close enough for the flotsam to read
// as debris rather than as noise.
const S4a = (f: number) => dolly([-50, 1.2, -4], [90, 0.8, -10], pushK(f, 344, 0.0018), { fov: 56 });
// Shot 5: low over the sludge looking up at the Palace — "built directly beside it"
// Shot 5 is "It is untreated sewage ... Parliament was built directly beside it." Both halves
// have to be in frame: the sludge AND the building. Low over the water at x = 16 looking back
// at the palace gives 23 % water, 33 % wall, 14 % tower — the only framing that holds the
// relation the sentence is making.
const S5a = (f: number) => dolly([16, 3.0, -14], [0, 12, 48], pushK(f, 407, 0.0014), { fov: 50 });
const S5b = (f: number) => dolly([20, 3.2, -22], [2, 12, 48], pushK(f, 490, 0.0018), { fov: 46, roll: 0.02 });
// Shot 6: the Members with handkerchiefs — medium group, the palace windows behind them
const S6a = (f: number) => dolly([0, 8.4, 29.5], [0, 7.3, 40], pushK(f, 560, 0.0018), { fov: 50 });
const S6b = (f: number) => dolly([-1.2, 8.1, 31.0], [-0.4, 7.4, 40], pushK(f, 630, 0.0016), { fov: 46, roll: -0.02 });
// Shot 7: the emptied terrace — "strong enough to empty a debating chamber"
const S7a = (f: number) => dolly([0, 16, 2], [0, 7, 40], pushK(f, 706, 0.0013), { fov: 48 });
// Shot 8: the water's edge — London drawing water from the same river. The queue stands on the
// stone steps (y ~ 4.9, z ~ 28.4), so the camera looks DOWN at them from just above the parapet;
// aiming at the terrace instead would put the whole queue under the bottom edge of the frame.
const S8a = (f: number) => dolly([5.5, 8.6, 21.5], [0, 5.9, 28.6], pushK(f, 840, 0.0014), { fov: 48 });
const S8b = (f: number) => dolly([3.2, 8.3, 23.5], [0.2, 5.9, 28.6], pushK(f, 910, 0.0016), { fov: 42, roll: 0.02 });
// Shot 9: the debate — "three million pounds in eighteen days". Eight Members arguing, shot from
// ON the terrace at their own height; the palace is the background, not the subject.
const S9a = (f: number) => dolly([0, 8.6, 27], [0, 7.4, 40], pushK(f, 988, 0.0016), { fov: 56 });
const S9b = (f: number) => dolly([-2, 8.4, 29], [0.5, 7.5, 40], pushK(f, 1060, 0.0018), { fov: 50, roll: -0.02 });
// Shot 10: INSIDE THE SEWER — the brick barrel vault, the navvies working in the lantern light.
// The tunnel is 10.4 m across and 70 m long. The camera starts 11 m back down the axis and travels
// in; the look point is at BODY height (y ~ -13.2), not at the tunnel axis — aimed at the axis the
// rays pass over their heads and the shot is 85 % brick with six men under the bottom edge.
const S10a = (f: number) => dolly([-8, -11.2, 1.0], [6, -13.3, 0.2], pushK(f, 1148, 0.0012), { fov: 52 });
const S10b = (f: number) => dolly([-4, -11.3, 0.9], [7, -13.4, -0.1], pushK(f, 1250, 0.0014), { fov: 48, roll: 0.018 });
// Shot 11: close on a Member — "the smell itself was the poison. It was not."
const S11a = (f: number) => dolly([0, 7.9, 33.5], [0, 7.6, 40], pushK(f, 1353, 0.0020), { fov: 40 });
// Shot 12: people breathing, alive — "the foul air was not spreading disease"
const S12a = (f: number) => dolly([0, 9.0, 28], [0, 7.5, 40], pushK(f, 1464, 0.0015), { fov: 56 });
const S12b = (f: number) => dolly([-3, 8.8, 31], [0.8, 7.6, 40], pushK(f, 1560, 0.0017), { fov: 48, roll: -0.018 });
// Shot 13: the river, golden — "carried the filth out of the city, and the smell with it"
const S13a = (f: number) => dolly([0, 10, -26], [0, 6, 48], pushK(f, 1646, 0.0014), { fov: 46 });
// Shot 14: the final pull-back — "London was saved by a mistake"
const S14a = (f: number) => dolly([0, 16, -20], [0, 12, 48], pushK(f, 1752, 0.0010), { fov: 46 });
const S14b = (f: number) => dolly([0, 30, -60], [0, 14, 48], pullK(f, 1820, 0.0011), { fov: 50 });

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: S1a },
    { f: 40, dur: 34, s: S1b }, // centred on 57 ("cannot breathe")
  ],
  2: [
    { f: 77, s: S2a },
    { f: 140, dur: 26, s: S2b },
  ],
  3: [
    { f: 220, s: S3a },
    { f: 280, dur: 24, s: S3b },
  ],
  4: [{ f: 344, s: S4a }],
  5: [
    { f: 407, s: S5a },
    { f: 490, dur: 28, s: S5b },
  ],
  6: [
    { f: 560, s: S6a },
    { f: 630, dur: 26, s: S6b },
  ],
  7: [{ f: 706, s: S7a }],
  8: [
    { f: 840, s: S8a },
    { f: 910, dur: 24, s: S8b },
  ],
  9: [
    { f: 988, s: S9a },
    { f: 1060, dur: 26, s: S9b },
  ],
  10: [
    { f: 1148, s: S10a },
    { f: 1250, dur: 34, s: S10b },
  ],
  11: [{ f: 1353, s: S11a }],
  12: [
    { f: 1464, s: S12a },
    { f: 1560, dur: 26, s: S12b },
  ],
  13: [{ f: 1646, s: S13a }],
  14: [
    { f: 1752, s: S14a },
    { f: 1820, dur: 40, s: S14b },
  ],
};

// impact kicks (reference v14): the image offset flips sign every frame (~3 px at 720p per unit), decays to 0 in
// 7 f, roll +-0.23 deg per unit; they start on the first frame at/after the event. No hand-held float.
// Anchored to measured word onsets: "It was not" (48.41), the sewer reveal (38.56), the final line (61.28).
const KICKS: [number, number][] = [[38.56, 0.8], [48.41, 1.0], [52.32, 0.5], [61.28, 0.7]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a; // metres at the look distance for 3 px x a
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens: depth of field ----------------
/** Lens blur per shot (thin lens). cInf = blur-disc radius in px at 1080x1920 for things at infinity; 0 = all sharp.
 *  Entries switch on cuts (no dur) or ramp with the camera glide they share f/dur with. focus = world point (else the
 *  camera look point). */
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 12 }, // at the window: the far bank soft, the rail sharp
  { f: 77, cInf: 0 }, // the reveal: establishing, all sharp
  { f: 220, cInf: 0 }, // the city from above
  { f: 344, cInf: 10 }, // on the water
  { f: 407, cInf: 0 }, // low at the Palace
  { f: 560, cInf: 12, focus: () => [-2, D0 + 1.5, 33] }, // the Members
  { f: 706, cInf: 0 }, // the empty terrace
  { f: 840, cInf: 10, focus: () => [0, D0 + 1.2, 31] }, // the water's edge
  { f: 988, cInf: 11, focus: () => [0, D0 + 1.5, 34] }, // the debate
  { f: 1148, cInf: 14, focus: () => [0, -12.2, 0] }, // the sewer: the far brick soft, the near rib sharp
  { f: 1353, cInf: 13, focus: () => [0, D0 + 1.55, 33] }, // close on the Member
  { f: 1464, cInf: 9, focus: () => [2, D0 + 1.4, 35] }, // the crowd
  { f: 1646, cInf: 0 }, // the golden river
  { f: 1752, cInf: 0 }, // the final pull-back
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
/** what the lens focuses on (DOF): the DOF table's focus point, else the camera look point */
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects: visible while a <= f < b; kit = a GLB name accepted by build.ts prop() */
// None in this film: a Victorian terrace has no Kenney bush or cart that would not read as a modern toy.
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [];
