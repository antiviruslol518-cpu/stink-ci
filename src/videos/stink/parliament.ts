// parliament.ts — the Westminster riverfront for "The Great Stink".
//
// Built on the template's primitives (Batch, boxGeo, quad, lam, stoneHD) rather than by
// modifying the bridge: the film needs a terrace, a Gothic palace, a sludge river and a brick
// sewer tunnel, and none of those are a suspension bridge.
//
// LAYOUT (metres, y = 0 is the river surface):
//
//        z = -120 ......... far bank ground, y = D0          the city across the water
//        z = -30  ......... far bank wall face (down to y = -2)
//        z = -30 .. +30 .... the Thames, sludge, y = 0
//        z = +30  ......... embankment wall face (y = -2 .. D0) + parapet
//        z = +30 .. +48 .... THE TERRACE, y = D0               <- the cast stands here
//        z = +48 .......... palace front face, y = D0 .. D0+H
//        z = +48 .. +64 .... palace body
//
// The terrace depth is the single most important number in this file. The first draft put the
// palace front at z = 33, three metres behind the parapet, and stood the cast at z = 33.2 —
// INSIDE the building. Every terrace camera then had 3 m of floor and a 26 m wall, so five
// shots rendered as flat stone. TERRACE_DEPTH is now a named constant and the cast is placed
// relative to it, so the two cannot drift apart again.
import * as THREE from "three";
import { Batch, boxGeo, quad, V, lam } from "./build";

const RIVER_W = 30;      // half-width of the river in z: the water mesh spans z = -30 .. 30
const QUAY = 30;         // z of the terrace edge — MUST equal RIVER_W, or the wall misses the water
const TERRACE_DEPTH = 18; // metres of walkable terrace between the parapet and the palace
const PALACE_Z = QUAY + TERRACE_DEPTH; // z of the palace front face
const D0 = 6.0;          // terrace height above the water

export type PalaceOpts = { lit: number; lime: boolean };

/**
 * A quad whose normal is forced toward `dir`.
 *
 * quad() derives its normal from the vertex winding, so a hand-written face that is wound the
 * wrong way is silently BACKFACE-CULLED: the geometry exists, costs its vertices, and never
 * appears. That is how the first draft of this set lost every gothic window, the sewer floor
 * and both embankment walls. Always say which way a face should look instead of hoping the
 * winding is right.
 */
function face(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, dir: THREE.Vector3) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
  return n.dot(dir) >= 0 ? quad(a, b, c, d) : quad(a, d, c, b);
}
const DOWN_RIVER = V(0, 0, -1); // palace side: the river is at lower z
const UP_RIVER = V(0, 0, 1);    // far bank: the river is at higher z
const UP = V(0, 1, 0);

/** A gothic window: a pointed arch, in the plane z = zc, facing the camera (-z). */
function arch(b: Batch, M: THREE.Material, x: number, y: number, w: number, h: number, z: number) {
  const half = w / 2, spring = y + h * 0.62;
  b.add(face(V(x - half, y, z), V(x + half, y, z), V(x + half, spring, z), V(x - half, spring, z), DOWN_RIVER), M);
  b.add(face(V(x - half, spring, z), V(x, spring, z), V(x, y + h, z), V(x - half * 0.15, spring + h * 0.3, z), DOWN_RIVER), M);
  b.add(face(V(x, spring, z), V(x + half, spring, z), V(x + half * 0.15, spring + h * 0.3, z), V(x, y + h, z), DOWN_RIVER), M);
}

/**
 * The Palace of Westminster: a long symmetrical gothic frontage with a central tower, two end
 * pavilions and rows of arched windows. Deliberately simplified to read at 1080x1920 — the
 * silhouette and the window rhythm carry it, not the carving.
 *
 * zc is the FRONT face. The body runs from zc back to zc + 16.
 */
export function palace(b: Batch, M: Record<string, THREE.Material>, zc: number, opts: PalaceOpts) {
  const H = 26;                       // main facade height
  const X0 = -58, X1 = 58;            // extent along the river
  const win = lam("palaceWin", () => ({ color: opts.lime ? "#e8e2c8" : "#3d4a5c" }));

  // main block
  b.add(boxGeo(V(X0, D0, zc), V(X1, D0 + H, zc + 16), 3), M.wall);
  // string courses
  for (const y of [D0 + 7, D0 + 15, D0 + H - 1.2]) {
    b.add(boxGeo(V(X0 - 0.4, y, zc - 0.35), V(X1 + 0.4, y + 0.55, zc + 16), 3), M.cope);
  }
  // parapet
  b.add(boxGeo(V(X0 - 0.5, D0 + H, zc - 0.5), V(X1 + 0.5, D0 + H + 1.1, zc + 16), 3), M.cope);

  // window rows — three tiers, the rhythm that reads as Victorian Gothic
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
    const disc = new THREE.CircleGeometry(2.1, 28);
    if (zz > zc + 8) disc.rotateY(Math.PI);
    b.add(disc, lam("clockFace", () => ({ color: "#f2e8cf" })), new THREE.Matrix4().makeTranslation(tx, D0 + H + 6, zz));
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

/**
 * The terrace / embankment the palace stands on, plus the parapet along the water.
 *
 * The terrace floor runs from the quay edge back under the palace. Its depth (TERRACE_DEPTH)
 * is what gives the terrace cameras room to stand back and the crowd somewhere to be.
 */
export function terrace(b: Batch, M: Record<string, THREE.Material>) {
  const back = PALACE_Z + 16; // run the floor under the whole palace so no gap shows at its base
  // ground behind the parapet
  b.add(face(V(-90, D0, QUAY), V(90, D0, QUAY), V(90, D0, back), V(-90, D0, back), UP), M.cobble);
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
 * The far bank: the city across the water. Three receding rows of low warehouses and chimneys,
 * so the far side reads as a town in haze rather than a single wall.
 *
 * Its wall faces +z (back toward the palace); its ground runs away to -z.
 */
export function farBank(b: Batch, M: Record<string, THREE.Material>) {
  b.add(face(V(-260, D0, -QUAY), V(260, D0, -QUAY), V(260, D0, -150), V(-260, D0, -150), UP), M.cobble);
  b.add(face(V(-260, D0, -QUAY), V(260, D0, -QUAY), V(260, -2, -QUAY), V(-260, -2, -QUAY), UP_RIVER), M.wall);

  // three rows, each further back and taller, so the skyline has depth instead of one flat band
  const rows: { z: number; h0: number; dh: number; w: number }[] = [
    { z: -QUAY - 3, h0: 7, dh: 3, w: 13 },
    { z: -QUAY - 26, h0: 10, dh: 5, w: 18 },
    { z: -QUAY - 56, h0: 13, dh: 7, w: 26 },
  ];
  for (const row of rows) {
    let x = -240;
    let i = 0;
    while (x < 240) {
      const w = row.w * (0.8 + ((i * 7) % 5) * 0.1);
      const h = row.h0 + ((i * 5) % 4) * row.dh;
      b.add(boxGeo(V(x, D0, row.z - 16), V(x + w, D0 + h, row.z), 3), M.wall);
      // roof
      b.add(boxGeo(V(x - 0.4, D0 + h, row.z - 16.4), V(x + w + 0.4, D0 + h + 0.9, row.z + 0.4), 3), M.tower);
      // chimney stack on every third building — the Victorian skyline
      if (i % 3 === 0) {
        b.add(boxGeo(V(x + w * 0.3, D0 + h, row.z - 9), V(x + w * 0.3 + 1.4, D0 + h + 5, row.z - 7.6), 2), M.tower);
      }
      x += w + 2.5;
      i++;
    }
  }
}

/**
 * The sewer: a brick barrel vault running along x at y = -14, with a mouth opening toward the
 * camera. Built separately from the river so the camera can drop into it.
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
    const am = (a0 + a1) / 2;
    const inward = V(0, -Math.sin(am), -Math.cos(am));
    b.add(
      face(V(-LEN / 2, Y + y0, z0), V(LEN / 2, Y + y0, z0), V(LEN / 2, Y + y1, z1), V(-LEN / 2, Y + y1, z1), inward),
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

/**
 * The one set of numbers the camera, the cast and the QA tool all agree on.
 * TERRACE_Z is where the cast stands; PALACE_Z is where the building starts.
 */
export const PARLIAMENT = { RIVER_W, QUAY, D0, TERRACE_DEPTH, PALACE_Z, TERRACE_Z: QUAY + TERRACE_DEPTH * 0.55 };
