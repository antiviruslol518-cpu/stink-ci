// parliament.ts — the Westminster riverfront for "The Great Stink".
//
// This is a NEW set built on the template's primitives (Batch, boxGeo, quad, lam, stoneHD)
// rather than a modification of the bridge: the film needs a terrace, a Gothic palace, a
// sludge river and a brick sewer tunnel, and none of those are a suspension bridge.
//
// Layout (metres, y = 0 is the river surface):
//   -30 .. 30   the Thames, sludge-coloured, slow
//   z = +30     the embankment wall; the terrace (and the Palace) sit on top, from z = +30 back
//   z = -30     the far bank (warehouses, haze)
//   the sewer tunnel is built at y = -14, far from the river geometry
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam } from "./build";

const RIVER_W = 30;      // half-width of the river in z: the water mesh spans z = -30 .. 30
const QUAY = 30;         // z of the terrace edge — MUST equal RIVER_W, or the wall misses the water
const D0 = 6.0;          // terrace height above the water

export type PalaceOpts = { lit: number; lime: boolean };

/**
 * A quad whose normal is forced toward `dir`.
 *
 * quad() derives its normal from the vertex winding, so a hand-written face that is
 * wound the wrong way is silently BACKFACE-CULLED: the geometry exists, costs its
 * vertices, and never appears. That is exactly how the first draft of this set lost
 * every gothic window, the sewer floor and both embankment walls. Always say which way
 * a face should look instead of hoping the winding is right.
 */
function face(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, dir: THREE.Vector3) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  return n.dot(dir) >= 0 ? quad(a, b, c, d) : quad(a, d, c, b);
}
const DOWN_RIVER = V(0, 0, -1); // palace side: the river is at lower z
const UP_RIVER = V(0, 0, 1);    // far bank: the river is at higher z
const UP = V(0, 1, 0);

/** A gothic window: a pointed arch made from two quads, in the plane z = zc, facing the camera (-z). */
function arch(b: Batch, M: THREE.Material, x: number, y: number, w: number, h: number, z: number) {
  const half = w / 2, spring = y + h * 0.62;
  b.add(face(V(x - half, y, z), V(x + half, y, z), V(x + half, spring, z), V(x - half, spring, z), DOWN_RIVER), M);
  // two lobes of the arch, meeting at the apex
  b.add(face(V(x - half, spring, z), V(x, spring, z), V(x, y + h, z), V(x - half * 0.15, spring + h * 0.3, z), DOWN_RIVER), M);
  b.add(face(V(x, spring, z), V(x + half, spring, z), V(x + half * 0.15, spring + h * 0.3, z), V(x, y + h, z), DOWN_RIVER), M);
}

/**
 * The Palace of Westminster: a long symmetrical gothic frontage with a central tower,
 * two end pavilions and rows of arched windows. Deliberately simplified to read at
 * 1080x1920 — the silhouette and the window rhythm carry it, not the carving.
 */
export function palace(b: Batch, M: Record<string, THREE.Material>, zc: number, opts: PalaceOpts) {
  const H = 26;                       // main facade height
  const X0 = -58, X1 = 58;            // extent along the river
  const win = lam("palaceWin", () => ({ color: opts.lime ? "#e8e2c8" : "#4a5a6e" }));

  // main block
  b.add(boxGeo(V(X0, D0, zc), V(X1, D0 + H, zc + 16), 3), M.wall);
  // string courses
  for (const y of [D0 + 7, D0 + 15, D0 + H - 1.2]) {
    b.add(boxGeo(V(X0 - 0.4, y, zc - 0.35), V(X1 + 0.4, y + 0.55, zc + 16), 3), M.cope);
  }
  // parapet
  b.add(boxGeo(V(X0 - 0.5, D0 + H, zc - 0.5), V(X1 + 0.5, D0 + H + 1.1, zc + 16), 3), M.cope);

  // window rows
  for (const row of [D0 + 2.2, D0 + 9.6, D0 + 17.5]) {
    for (let x = X0 + 4; x < X1 - 3; x += 4.2) {
      arch(b, win, x, row, 1.9, 5.0, zc - 0.05);
    }
  }

  // central tower (the clock tower reads as a landmark silhouette)
  const tx = 0, tw = 9;
  b.add(boxGeo(V(tx - tw / 2, D0, zc - 1), V(tx + tw / 2, D0 + H + 12, zc + 16), 3), M.tower);
  b.add(boxGeo(V(tx - tw / 2 - 0.5, D0 + H + 12, zc - 1.5), V(tx + tw / 2 + 0.5, D0 + H + 13.2, zc + 16), 3), M.cope);
  // spire
  const spire = new THREE.ConeGeometry(tw * 0.62, 11, 4);
  spire.rotateY(Math.PI / 4);
  b.add(spire, M.tower, new THREE.Matrix4().makeTranslation(tx, D0 + H + 13.2 + 5.5, zc + 7.5));
  // clock faces (blank discs — no text anywhere in this film)
  for (const zz of [zc - 1.2, zc + 16.2]) {
    const face = new THREE.CircleGeometry(2.1, 28);
    if (zz > zc + 8) face.rotateY(Math.PI);
    b.add(face, lam("clockFace", () => ({ color: "#f2e8cf" })), new THREE.Matrix4().makeTranslation(tx, D0 + H + 6, zz));
  }

  // end pavilions
  for (const s of [-1, 1]) {
    const px = s * 47;
    b.add(boxGeo(V(px - 7, D0, zc - 2), V(px + 7, D0 + H + 5, zc + 16), 3), M.tower);
    b.add(boxGeo(V(px - 7.6, D0 + H + 5, zc - 2.5), V(px + 7.6, D0 + H + 6.4, zc + 16), 3), M.cope);
    for (const sx of [-1, 1]) {
      const cap = new THREE.ConeGeometry(2.0, 6.5, 4);
      cap.rotateY(Math.PI / 4);
      b.add(cap, M.tower, new THREE.Matrix4().makeTranslation(px + sx * 4.4, D0 + H + 9.7, zc + 7));
    }
  }
}

/** The terrace / embankment the palace stands on, plus the parapet along the water. */
export function terrace(b: Batch, M: Record<string, THREE.Material>) {
  // ground behind the parapet, running from the quay back under the palace
  b.add(face(V(-90, D0, QUAY), V(90, D0, QUAY), V(90, D0, 120), V(-90, D0, 120), UP), M.cobble);
  // embankment wall down to the water (its face looks out over the river, toward -z)
  b.add(face(V(-90, D0, QUAY), V(90, D0, QUAY), V(90, -2, QUAY), V(-90, -2, QUAY), DOWN_RIVER), M.wall);
  // parapet with coping
  b.add(boxGeo(V(-90, D0, QUAY - 0.9), V(90, D0 + 1.05, QUAY), 2), M.wall);
  b.add(boxGeo(V(-90, D0 + 1.05, QUAY - 1.05), V(90, D0 + 1.3, QUAY + 0.05), 2), M.cope);
  // stone steps down to the water (a place for characters to stand)
  for (let i = 0; i < 5; i++) {
    const y = D0 - (i + 1) * 1.15;
    b.add(boxGeo(V(-3.2, y, QUAY - 1.0 - i * 1.15), V(3.2, y + 1.15, QUAY - 1.0 - (i + 1) * 1.15), 2), M.cope);
  }
}

/**
 * The far bank: low warehouses in haze, so the river has a far side without a second town.
 * Its wall faces +z (back toward the palace); its ground runs away to -z.
 */
export function farBank(b: Batch, M: Record<string, THREE.Material>) {
  b.add(face(V(-200, D0, -QUAY), V(200, D0, -QUAY), V(200, D0, -120), V(-200, D0, -120), UP), M.cobble);
  b.add(face(V(-200, D0, -QUAY), V(200, D0, -QUAY), V(200, -2, -QUAY), V(-200, -2, -QUAY), UP_RIVER), M.wall);
  let x = -180;
  let i = 0;
  while (x < 180) {
    const w = 11 + (i % 3) * 4;
    const h = 9 + (i % 4) * 3;
    b.add(boxGeo(V(x, D0, -QUAY - 14), V(x + w, D0 + h, -QUAY - 2), 3), M.wall);
    // roof
    b.add(boxGeo(V(x - 0.4, D0 + h, -QUAY - 14.4), V(x + w + 0.4, D0 + h + 0.9, -QUAY - 1.6), 3), M.tower);
    x += w + 2.5;
    i++;
  }
}

/**
 * The sewer: a brick barrel vault running along x at y = -14, with a mouth opening toward
 * the camera. Built separately from the river so the camera can drop into it.
 *
 * The vault is a half-cylinder: a0..PI sweeps from +z up over the crown and down to -z.
 * Each segment's normal points INWARD (toward the tunnel axis), which is what the camera
 * inside the tunnel sees. The floor faces up.
 */
export function sewer(b: Batch, M: Record<string, THREE.Material>) {
  const Y = -14, R = 5.2, LEN = 70;
  // floor, facing up
  b.add(face(V(-LEN / 2, Y, -R), V(LEN / 2, Y, -R), V(LEN / 2, Y, R), V(-LEN / 2, Y, R), UP), M.brick);
  // walls + arched ceiling: 10 segments, each a strip running the length of the tunnel
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N);
    const z0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R;
    const z1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
    // inward normal at the middle of the strip
    const am = (a0 + a1) / 2;
    const inward = V(0, -Math.sin(am), -Math.cos(am));
    b.add(
      face(
        V(-LEN / 2, Y + y0, z0),
        V(LEN / 2, Y + y0, z0),
        V(LEN / 2, Y + y1, z1),
        V(-LEN / 2, Y + y1, z1),
        inward,
      ),
      M.brick,
    );
  }
  // brick rings: the repeating rib is what makes it read as a sewer
  for (let x = -LEN / 2; x <= LEN / 2; x += 4.5) {
    for (let i = 0; i < N; i++) {
      const a = Math.PI * (i / N);
      const z = Math.cos(a) * (R - 0.15), y = Y + Math.sin(a) * (R - 0.15);
      b.add(boxGeo(V(x - 0.22, y - 0.22, z - 0.22), V(x + 0.22, y + 0.22, z + 0.22)), M.brickDark);
    }
  }
}

/** Sludge: a slow surface with no glint. Separate from the template's clear water. */
export function sludgeMaterial() {
  return new THREE.MeshLambertMaterial({ color: "#5d5340" });
}

export const PARLIAMENT = { RIVER_W, QUAY, D0 };
