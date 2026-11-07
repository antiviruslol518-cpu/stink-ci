// parliament.ts — the Westminster riverfront for "The Great Stink".
//
// This is a NEW set built on the template's primitives (Batch, boxGeo, quad, lam, stoneHD)
// rather than a modification of the bridge: the film needs a terrace, a Gothic palace, a
// sludge river and a brick sewer tunnel, and none of those are a suspension bridge.
//
// Layout (metres, y = 0 is the river surface):
//   -30 .. 30   the Thames, sludge-coloured, slow
//    30 .. 36.5 embankment terrace (the Palace sits on it)
//   z = +40     the Palace of Westminster facade, running along x
//   z = -40     the far bank (warehouses, haze)
//   the sewer tunnel is built at y = -14, far from the river geometry
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam } from "./build";
import { stoneHD, cobbleHD } from "./paint";

const RIVER_W = 30;      // half-width of the river in z
const QUAY = 36.5;       // z of the terrace edge on the palace side
const D0 = 6.0;          // terrace height above the water

export type PalaceOpts = { lit: number; lime: boolean };

/** A gothic window: a pointed arch made from two quads, in the plane z = zc. */
function arch(b: Batch, M: THREE.Material, x: number, y: number, w: number, h: number, z: number) {
  const half = w / 2, spring = y + h * 0.62;
  b.add(quad(V(x - half, y, z), V(x + half, y, z), V(x + half, spring, z), V(x - half, spring, z)), M);
  // two lobes of the arch, meeting at the apex
  b.add(quad(V(x - half, spring, z), V(x, spring, z), V(x, y + h, z), V(x - half * 0.15, spring + h * 0.3, z)), M);
  b.add(quad(V(x, spring, z), V(x + half, spring, z), V(x + half * 0.15, spring + h * 0.3, z), V(x, y + h, z)), M);
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
  // ground behind the parapet
  b.add(quad(V(-90, D0, QUAY), V(90, D0, 120), V(90, D0, -60), V(-90, D0, -60)), M.cobble);
  // embankment wall down to the water
  b.add(quad(V(-90, D0, QUAY), V(90, D0, QUAY), V(90, -2, QUAY), V(-90, -2, QUAY)), M.wall);
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
 */
export function farBank(b: Batch, M: Record<string, THREE.Material>) {
  b.add(quad(V(-200, D0, -QUAY), V(200, D0, -QUAY), V(200, D0, -120), V(-200, D0, -120)), M.cobble);
  b.add(quad(V(-200, D0, -QUAY), V(200, D0, -QUAY), V(200, -2, -QUAY), V(-200, -2, -QUAY)), M.wall);
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
 */
export function sewer(b: Batch, M: Record<string, THREE.Material>) {
  const Y = -14, R = 5.2, LEN = 70;
  // floor
  b.add(quad(V(-LEN / 2, Y, -R), V(LEN / 2, Y, -R), V(LEN / 2, Y, R), V(-LEN / 2, Y, R)), M.brick);
  // walls + arched ceiling, approximated with 8 segments each side
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N);
    const p0 = [Math.cos(a0) * R, Math.sin(a0) * R];
    const p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
    b.add(
      quad(
        V(-LEN / 2, Y, p0[0]),
        V(LEN / 2, Y, p0[0]),
        V(LEN / 2, Y + p1[1] + 0.01, p1[0]),
        V(-LEN / 2, Y + p0[1] + 0.01, p0[0]),
      ),
      M.brick,
    );
  }
  // brick rings every 3 m: the repeating rib is what makes it read as a sewer
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
