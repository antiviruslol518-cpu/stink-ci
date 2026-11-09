// rowscan.mjs — what does the shot-6 camera actually hit, row by row, around a given row?
//
// The ink band on frame 601 sits at row 1127 of a 648x1152 still (scale 0.6). This casts one
// ray per row through the same camera the renderer uses and reports the surface name, distance
// and world point, so a depth STEP in the geometry can be told from a constant-depth triangulation
// boundary. Pure geometry: no WebGL, no browser.
//
// LIMITATION — READ BEFORE TRUSTING A RESULT FROM THIS TOOL.
// The `Batch` below is a REDUCED COPY of the one in build.ts, not the same code. The real
// Batch.add() also copies each geometry's normals (computeVertexNormals() when absent) and
// applies the caller's matrix `m`; this one copies POSITIONS ONLY. Two consequences:
//   * every raycast answer describes parliament.ts's raw vertex positions, which is what you
//     want for "does the floor have a geometric step at this row" — that question is unaffected;
//   * it is NOT a model of what the renderer draws. Anything that depends on normals, winding
//     or a per-instance matrix (shading, backface culling, the cast, the water shader) is
//     simply absent here. Do not use this tool to explain a pixel colour or a lighting change.
// It also omits flotsam(), the actors and the fx, and models the river as a flat quad.
// A depth disagreement between this tool and InkPass's readback is therefore evidence about
// the GEOMETRY; it is never by itself evidence about the render.
//
// Usage: node tools/rowscan.mjs [--shot 6] [--frame 601] [--rows 1115:1145] [--w 648] [--h 1152]
//                                [--x 324] [--x 60] [--x 588]
import * as THREE from "three";
import { build } from "esbuild";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const all = (k) => process.argv.reduce((a, v, i) => (v === "--" + k ? [...a, process.argv[i + 1]] : a), []);
const SHOT = Number(arg("shot", "6"));
const FRAME = Number(arg("frame", "601"));
const [R0, R1] = arg("rows", "1115:1145").split(":").map(Number);
const W = Number(arg("w", "648"));
const H = Number(arg("h", "1152"));
const XS = all("x").map(Number);

const load = async (rel) => {
  const r = await build({ entryPoints: [path.resolve(rel)], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const story = await load("src/videos/stink/story.ts");
const parl = await load("src/videos/stink/parliament.ts");

// --- rebuild the set the same way world.ts does: one merged geometry per material ----------
class Batch {
  constructor() { this.g = new Map(); }
  add(geo, mat) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const x = new THREE.BufferGeometry();
    x.setAttribute("position", new THREE.Float32BufferAttribute(src.attributes.position.array.slice(), 3));
    const l = this.g.get(mat);
    if (l) l.push(x); else this.g.set(mat, [x]);
  }
}
const named = (n) => ({ name: n, __name: n, isMaterial: true });
const M = {};
for (const n of ["cobble", "wall", "cope", "tower", "brick", "brickDark", "iron", "steel", "wood", "glass", "mat4", "mat9"]) M[n] = named(n);

const b = new Batch();
parl.terrace(b, M);
parl.palace(b, M, parl.PARLIAMENT?.PALACE_Z ?? 48, { lit: 1, lime: false });
parl.farBank(b, M);
parl.sewer(b, M);
parl.chamber(b, M);

const meshes = [];
for (const [mat, list] of b.g) {
  const pos = [];
  for (const g of list) pos.push(...g.attributes.position.array);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.name = mat.__name;
  meshes.push(mesh);
}
// the river surface (world.ts adds it as its own quad at y = 0 spanning z = -30..30)
const wg = new THREE.BufferGeometry();
wg.setAttribute("position", new THREE.Float32BufferAttribute([-900, 0, 30, 900, 0, 30, 900, 0, -30, -900, 0, 30, 900, 0, -30, -900, 0, -30], 3));
const water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
water.name = "WATER";
meshes.push(water);
for (const m of meshes) m.updateMatrixWorld(true);

// --- the exact camera world.ts builds for this frame ---------------------------------------
const c = story.camAt(SHOT, FRAME);
const cam = new THREE.PerspectiveCamera(c.fov, W / H, 0.2, 1500);
cam.position.set(...c.pos);
cam.up.set(0, 1, 0);
cam.lookAt(...c.look);
cam.rotateZ(c.roll ?? 0);
cam.updateMatrixWorld(true);

console.log(`shot ${SHOT} frame ${FRAME}  cam ${c.pos.map((v) => v.toFixed(2)).join(",")}  look ${c.look.map((v) => v.toFixed(2)).join(",")}  fov ${c.fov}  ${W}x${H}`);

const ray = new THREE.Raycaster();
ray.far = 1200;
const xs = XS.length ? XS : [Math.round(W / 2)];
const ndc = new THREE.Vector2();
const v = new THREE.Vector3();

for (const x of xs) {
  console.log(`\n--- x = ${x} ---`);
  console.log("  row   surface      dist(m)   z(m)      y(m)     x(m)     d(dist)");
  let prev = null;
  for (let row = R0; row <= R1; row++) {
    ndc.set((x / W) * 2 - 1, -((row / H) * 2 - 1));
    v.set(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    ray.set(cam.position, v);
    const hits = ray.intersectObjects(meshes, false);
    if (!hits.length) { console.log(`  ${String(row).padStart(4)}   (sky)`); prev = null; continue; }
    const h = hits[0];
    const p = h.point;
    const step = prev ? (h.distance - prev).toFixed(4) : "";
    const flag = prev !== null && Math.abs(h.distance - prev) > 0.005 ? "  <-- STEP" : "";
    console.log(`  ${String(row).padStart(4)}   ${h.object.name.padEnd(10)} ${h.distance.toFixed(3).padStart(7)}  ${p.z.toFixed(3).padStart(8)}  ${p.y.toFixed(3).padStart(7)}  ${p.x.toFixed(2).padStart(7)}  ${String(step).padStart(8)}${flag}`);
    prev = h.distance;
  }
}
