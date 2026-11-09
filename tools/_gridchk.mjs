import * as THREE from "three";
const { build } = await import("esbuild");
const load = async (rel) => {
  const r = await build({ entryPoints: [rel], bundle: true, write: false, format: "esm",
    platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const parl = await load("src/videos/stink/parliament.ts");
const geos = [];
const b = { add: (g) => { geos.push(g); } };
const M = { cobble: { isMaterial: true, __name: "cobble" }, wall: { isMaterial: true, __name: "wall" } };
parl.terrace(b, M);
const floor = geos.slice(0, 128);
// quad() emits a,b,c,a,c,d -> 6 vertices. Dedupe per quad, then count across quads.
const key = (x,y,z) => x.toPrecision(17)+","+y.toPrecision(17)+","+z.toPrecision(17);
const counts = new Map();
for (const g of floor) {
  const p = g.attributes.position.array;
  const set = new Set();
  for (let i = 0; i < p.length; i += 3) set.add(key(p[i],p[i+1],p[i+2]));
  if (set.size !== 4) console.log("WARN: quad with", set.size, "distinct corners");
  for (const k of set) counts.set(k, (counts.get(k)||0)+1);
}
const hist = {};
for (const c of counts.values()) hist[c] = (hist[c]||0)+1;
console.log("share histogram:", hist, " distinct:", counts.size, " expected 153");
console.log("expected: {1:4, 2:44, 4:105}");
// any position shared by 3 quads is a defect
const odd = [...counts.entries()].filter(([,c]) => c === 3);
console.log("count-3 positions (would be cracks):", odd.length);
// UV continuity: do neighbouring quads agree on uv at the shared boundary?
