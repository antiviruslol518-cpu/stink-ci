// marks.ts — WHERE everyone stands, with no drawing attached.
//
// cast.ts decides where each character is AND how to paint them, in the same module, and it
// touches `document.createElement("canvas")` at import time. That makes it impossible to ask
// "is this shot composed well?" without a browser — which is exactly the question a still costs
// 15 minutes of CI to answer.
//
// So placement lives here: pure arithmetic, no three.js objects, no canvas. cast.ts imports it
// and adds the drawing; tools/sightlines.mjs imports it and raycasts against capsules. Both
// therefore agree on where the people are, because there is only one copy of the answer.
import { PARLIAMENT } from "./parliament";

export type Mark = {
  /** which actor slot / outfit */
  i: number;
  x: number;
  y: number;
  z: number;
  /** "stand" | "sit" | "stroll" */
  mode: "stand" | "sit" | "stroll";
  scale: number;
};

const TERRACE_Y = PARLIAMENT.D0;
export const TERRACE_Z = PARLIAMENT.TERRACE_Z;
export const QUAY = PARLIAMENT.QUAY;

/** stable pseudo-random in [0,1) — the same hash cast.ts uses, so marks match the drawn cast */
const hh = (i: number, s = 0) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Members on the terrace: handkerchiefs to their faces. Shot 6 (7 of them) and 11 (3, close).
 *
 * TWO ROWS, not a line. The frame is 1080x1920, so the horizontal field is only ~0.56 of the
 * vertical one: a single row of seven people is 11 m wide and has to be shot from 31 m away to
 * fit, which makes each Member about 2 % of the frame. Two staggered rows are 5.5 m wide, read
 * at 10 m, and every face is still legible. This is a framing constraint, not a crowd-size one.
 */
export function mpMarks(close: boolean): Mark[] {
  const out: Mark[] = [];
  if (close) {
    for (let i = 0; i < 3; i++) {
      out.push({ i: i + 10, x: (i - 1) * 1.25, y: TERRACE_Y, z: TERRACE_Z + (i === 1 ? 0.9 : 0), mode: "stand", scale: 1 });
    }
    return out;
  }
  const rows = [[4, 1.35, -0.7], [3, 1.45, 1.1]] as const;
  let n = 0;
  for (const [count, dx, dz] of rows) {
    for (let i = 0; i < count; i++) {
      out.push({ i: n + 10, x: (i - (count - 1) / 2) * dx, y: TERRACE_Y, z: TERRACE_Z + dz, mode: "stand", scale: 1 });
      n++;
    }
  }
  return out;
}

/** Ordinary Londoners: a queue at the water's edge (shot 8), or a crowd just breathing (shot 12). */
export function folkMarks(n: number, z0: number, spread: number, base: number): Mark[] {
  const out: Mark[] = [];
  const half = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    // two rows, so the group reads at 9-12 m instead of needing 30 m
    const front = i < half;
    const k = front ? i - (half - 1) / 2 : i - half - (n - half - 1) / 2;
    const x = k * spread + (hh(i, 2) - 0.5) * 0.3;
    const z = z0 + (front ? -0.75 : 0.85) + (hh(i, 3) - 0.5) * 0.5;
    out.push({ i: i + base, x, y: TERRACE_Y, z, mode: "stand", scale: 1 });
  }
  return out;
}

/**
 * Shot 8: the queue ON THE STEPS at the water's edge — "London had been drinking from that same
 * river". The steps are the only place a body is not hidden behind the 1.3 m parapet: standing on
 * the terrace, everyone below the chest is occluded from any camera over the water.
 *
 * Step i has its top at D0 - i*1.15 and spans z = QUAY-1.0-(i+1)*1.15 .. QUAY-1.0-i*1.15.
 */
export function stepsMarks(): Mark[] {
  const out: Mark[] = [];
  const stepTop = (i: number) => PARLIAMENT.D0 - i * 1.15;
  const stepZ = (i: number) => PARLIAMENT.QUAY - 1.0 - (i + 0.5) * 1.15;
  // front row on step 1, back row on step 2, staggered in x
  const layout: [number, number, number][] = [
    [-1.9, 1, 0], [-0.55, 1, 0], [0.8, 1, 0],
    [-1.25, 2, 0], [0.15, 2, 0], [1.5, 2, 0],
  ];
  layout.forEach(([x, step], n) => {
    out.push({ i: n + 30, x, y: stepTop(step), z: stepZ(step), mode: "stand", scale: 1 });
  });
  return out;
}

/** Shot 9: the debate — a cluster of Members arguing. */
export function debateMarks(): Mark[] {
  const out: Mark[] = [];
  const rows = [[5, 1.3, -0.7], [3, 1.5, 1.2]] as const;
  let n = 0;
  for (const [count, dx, dz] of rows) {
    for (let i = 0; i < count; i++) {
      out.push({ i: n + 50, x: (i - (count - 1) / 2) * dx, y: TERRACE_Y, z: TERRACE_Z + dz, mode: "stand", scale: 1 });
      n++;
    }
  }
  return out;
}

/**
 * Shot 10: navvies inside the sewer, crouched and working.
 *
 * They cluster in the NEAR half of the tunnel and the camera comes at them from 9 m, because the
 * tunnel is 10.4 m across and 70 m long: spread evenly, each man is 20 m away and 3 % of a frame
 * whose other 90 % is brick. Two rows of three, one pair turned to the wall.
 */
export function labourerMarks(): Mark[] {
  const out: Mark[] = [];
  const layout: [number, number][] = [
    [-2.6, -1.6], [0.2, -1.9], [2.9, -1.5],
    [-1.4, 1.3], [1.6, 1.6], [4.1, 0.9],
  ];
  layout.forEach(([x, z], i) => {
    out.push({ i: i + 70, x: x + 2, y: -14, z, mode: "sit", scale: 1 });
  });
  return out;
}
