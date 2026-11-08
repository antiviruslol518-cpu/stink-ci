// sightlines.mjs — check what every shot actually LOOKS AT, without rendering a pixel.
//
// Why: a camera buried in a wall renders a perfectly valid frame that is 100 % wall. It costs
// a CI round (~15 min) to find out, and the stills come back as fourteen beige rectangles.
// Raycasting is pure geometry — no WebGL, no browser, no memory pressure — so the whole film
// can be judged in about a second on any machine.
//
// What it does: rebuilds the set from parliament.ts exactly as world.ts does, then for each
// shot casts a grid of rays through the frame from the shot's camera and reports, per frame:
//   - the fraction of the frame filled by the single largest surface
//   - how far away that surface is
//   - how much of the frame is sky
//
// A shot is BROKEN when one surface owns most of the frame from close range: that is a wall,
// not a composition. A shot is EMPTY when almost all of it is sky.
//
// Usage: node tools/sightlines.mjs [--shots 1,2,3] [--grid 16x9] [--at 0.5]
import * as THREE from "three";
import { build } from "esbuild";
import path from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const GRID = arg("grid", "16x9").split("x").map(Number);
const AT = Number(arg("at", "0.5"));       // 0 = shot start, 1 = shot end
const ONLY = arg("shots", "").split(",").filter(Boolean).map(Number);
// --cam "x,y,z>x,y,z,fov[,roll]" judges a CANDIDATE framing without touching story.ts.
// Repeatable: every candidate is scored and printed as its own row, so a camera can be
// searched for in one run instead of one 15-minute stills round per idea.
const CAMS = process.argv.reduce((acc, a, i) => {
  if (a === "--cam" && process.argv[i + 1]) acc.push(process.argv[i + 1]);
  return acc;
}, []);
const CROWD = arg("crowd", "");            // crowd type to include for --cam candidates

const load = async (rel) => {
  const r = await build({ entryPoints: [path.resolve(rel)], bundle: true, write: false, format: "esm", platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};

const story = await load("src/videos/stink/story.ts");
const parl = await load("src/videos/stink/parliament.ts");
// ---- rebuild the set exactly as world.ts does ----------------------------------------
// Batch merges by material, so build the same way: one mesh per material, named after it.
class Batch {
  constructor() { this.g = new Map(); }
  add(geo, mat, m) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const x = new THREE.BufferGeometry();
    x.setAttribute("position", new THREE.Float32BufferAttribute(src.attributes.position.array.slice(), 3));
    if (src.attributes.normal) x.setAttribute("normal", new THREE.Float32BufferAttribute(src.attributes.normal.array.slice(), 3));
    if (m) x.applyMatrix4(m);
    const l = this.g.get(mat);
    if (l) l.push(x); else this.g.set(mat, [x]);
  }
  meshes() {
    const out = [];
    let i = 0;
    for (const [mat, list] of this.g) {
      const pos = [], nor = [];
      for (const g of list) {
        pos.push(...g.attributes.position.array);
        if (g.attributes.normal) nor.push(...g.attributes.normal.array);
        else nor.push(...new Float32Array(g.attributes.position.count * 3));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.name = mat.__name || mat.name || `mat${i}`;
      mesh.userData.mat = mat;
      out.push(mesh);
      i++;
    }
    return out;
  }
}

// A material stand-in that carries a readable name. parliament.ts only passes materials around,
// never reads their properties, so an inert object is enough to keep the batches apart.
const named = (n) => ({ name: n, isMaterial: true });
const M = {};
for (const n of ["cobble", "wall", "cope", "tower", "brick", "brickDark", "iron", "steel", "wood"]) M[n] = named(n);

const b = new Batch();
parl.terrace(b, M);
parl.palace(b, M, parl.PARLIAMENT.PALACE_Z, { lit: 1, lime: false });
parl.farBank(b, M);
parl.sewer(b, M);
parl.chamber(b, M);
parl.flotsam(b, M);
const meshes = b.meshes();

// the river surface: world.ts adds it as its own quad at y = 0 spanning z = -30..30
const wg = new THREE.BufferGeometry();
wg.setAttribute("position", new THREE.Float32BufferAttribute([-900, 0, 30, 900, 0, 30, 900, 0, -30, -900, 0, 30, 900, 0, -30, -900, 0, -30], 3));
const water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
water.name = "WATER";
meshes.push(water);
for (const m of meshes) m.updateMatrixWorld(true);

// ---- the cast ---------------------------------------------------------------------------
// A composition is judged by where the PEOPLE are, not just what the walls do. Placement lives
// in marks.ts — pure arithmetic, no canvas — so this tool and the renderer share one answer.
const marks = await load("src/videos/stink/marks.ts");
const personGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.75, 8);
personGeo.translate(0, 0.875, 0);
const personMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function castFor(crowd, id) {
  let list;
  if (crowd === "mps") list = marks.mpMarks(id === 11);
  else if (crowd === "debate") list = marks.debateMarks();
  else if (crowd === "intake") list = marks.stepsMarks();
  else if (crowd === "folk") list = marks.folkMarks(9, marks.TERRACE_Z + 0.4, 1.8, 30);
  else if (crowd === "labourers") list = marks.labourerMarks();
  else return [];
  return list.map((p) => {
    const m = new THREE.Mesh(personGeo, personMat);
    m.position.set(p.x, p.y, p.z);
    const sc = p.scale ?? 1;
    m.scale.set(sc, sc, sc);
    m.updateMatrixWorld(true);
    m.name = "PERSON";
    return m;
  });
}
const addCast = (id, f) => castFor(story.SHOTS[id - 1].crowd, id);

const scene = new THREE.Scene();
for (const m of meshes) scene.add(m);

const ray = new THREE.Raycaster();
ray.far = 1200;

/** cast one ray and say what it hits */
function shoot(origin, dir) {
  ray.set(origin, dir);
  const hits = ray.intersectObjects(meshes, false);
  return hits.length ? { name: hits[0].object.name, d: hits[0].distance, p: hits[0].point } : null;
}

const fmt = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));

/** Score one camera against the set (+ the people this shot would have). */
function score(c, people, label) {
  const cam = new THREE.PerspectiveCamera(c.fov, 9 / 16, 0.2, 1500); // portrait: 1080x1920
  cam.position.set(...c.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(...c.look);
  cam.rotateZ(c.roll ?? 0);
  cam.updateMatrixWorld(true);

  for (const p of people) scene.add(p);
  const targets = meshes.concat(people);
  const tally = new Map();
  let sky = 0, near = 0, sumD = 0, n = 0;

  // Is the camera buried in geometry? Cast a few rays BACKWARD: a surface behind the camera and
  // within 2 m means the camera is inside a wall or a solid block, which renders a valid picture
  // of nothing at all.
  //
  // This does NOT catch the other way a camera can show nothing: standing 4 m from a window
  // opening so the frame is entirely the opening and the room is behind you. That failure looks
  // perfectly healthy by every number here — which is why the surface breakdown matters. A shot
  // that is supposed to be inside a room must show that room's own materials (for the chamber,
  // `wood` for the floor and benches); if it shows only exterior surfaces, the camera is on the
  // wrong side of the glass no matter what the percentages say.
  //
  // The 0.6 m floor keeps debris lying ON the water (flotsam) from counting: a camera skimming
  // the surface legitimately has specks within a metre of it.
  let embedded = false;
  for (const back of [[0, 0, -1], [0.6, 0, -1], [-0.6, 0, -1], [0, 0.6, -1], [0, -0.6, -1]]) {
    const d = new THREE.Vector3(...back).normalize().applyQuaternion(cam.quaternion);
    ray.set(cam.position, d);
    const h = ray.intersectObjects(meshes, false);
    if (h.length && h[0].distance > 0.6 && h[0].distance < 2.0) { embedded = true; break; }
  }
  for (let iy = 0; iy < GRID[1]; iy++) {
    for (let ix = 0; ix < GRID[0]; ix++) {
      const ndc = new THREE.Vector2(((ix + 0.5) / GRID[0]) * 2 - 1, -(((iy + 0.5) / GRID[1]) * 2 - 1));
      const v = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
      ray.set(cam.position, v);
      const hits = ray.intersectObjects(targets, false);
      if (!hits.length) { sky++; continue; }
      const h = hits[0];
      n++;
      sumD += h.distance;
      if (h.distance < 6) near++;
      tally.set(h.object.name, (tally.get(h.object.name) || 0) + 1);
    }
  }
  for (const p of people) scene.remove(p);

  const cells = GRID[0] * GRID[1];
  const top = [...tally.entries()].sort((a, c2) => c2[1] - a[1])[0] || ["-", 0];
  return {
    id: label,
    embedded,
    pos: c.pos.map(fmt).join(","),
    top: top[0], topPct: (top[1] / cells) * 100,
    people: ((tally.get("PERSON") || 0) / cells) * 100,
    nPeople: people.length,
    sky: (sky / cells) * 100,
    near: (near / cells) * 100,
    mean: n ? sumD / n : 0,
    sets: [...tally.entries()].sort((a, c2) => c2[1] - a[1]).map(([k, v]) => `${k}:${Math.round((v / cells) * 100)}`).join(" "),
  };
}

const rows = [];

for (const s of story.SHOTS) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  const f = Math.round(s.a + (s.b - s.a) * AT);
  rows.push({ ...score(story.camAt(s.id, f), addCast(s.id, f), String(s.id)), f });
}

// ---- candidate framings (--cam "x,y,z>x,y,z,fov[,roll]") --------------------------------
for (const spec of CAMS) {
  const [p, l] = spec.split(">");
  const pos = p.split(",").map(Number);
  const [lx, ly, lz, fov, roll] = l.split(",").map(Number);
  const people = CROWD ? castFor(CROWD, story.SHOTS.find((s) => s.crowd === CROWD)?.id ?? 1) : [];
  rows.push({ ...score({ pos, look: [lx, ly, lz], fov, roll: roll || 0 }, people, "cand"), f: "-" });
}

const pad = (x, w) => String(x).padStart(w);
console.log(`frame shot  camera                 top surf      %fr  ppl  cast  sky%  <6m%  meand  surfaces`);
for (const r of rows) {
  // A shot is only broken when one surface owns most of the frame AND there is nobody in it.
  // A palace wall behind seven Members is a background, not a failure.
  // EMBEDDED is checked first and is the most serious: a camera inside a wall, or standing in a
  // window opening so the opening owns the frame, produces a picture of nothing. It also evades
  // every other test, because "40 % wall at 30 m" looks like a perfectly reasonable shot.
  const bad = r.embedded ? "  <== EMBEDDED (camera inside geometry)"
    : r.topPct > 62 && r.people < 6 && r.mean < 30 ? "  <== WALL"
    : r.sky > 80 ? "  <== EMPTY"
    : r.mean < 7 && r.people < 12 ? "  <== TOO CLOSE" : "";
  console.log(
    `${pad(r.f, 5)} ${pad(r.id, 4)}  ${r.pos.padEnd(20)} ${r.top.padEnd(12)} ${pad(Math.round(r.topPct), 3)}  ${pad(Math.round(r.people), 3)}  ${pad(r.nPeople, 4)}  ${pad(Math.round(r.sky), 4)}  ${pad(Math.round(r.near), 4)}  ${pad(fmt(r.mean), 5)}  ${r.sets}${bad}`,
  );
}
