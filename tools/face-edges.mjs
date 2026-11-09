// Report the longest TRIANGLE edge on every face added to the set, by material.
// A huge two-triangle face is where per-triangle interpolation defects live (frame 601).
// Pure geometry — no rendering.
const THREE = await import("three");
const { build } = await import("esbuild");
const load = async (rel) => {
  const r = await build({ entryPoints: [rel], bundle: true, write: false, format: "esm",
    platform: "neutral", target: "es2020", logLevel: "silent" });
  return import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
};
const parl = await load("src/videos/stink/parliament.ts");
const named = (n) => ({ name: n, __name: n, isMaterial: true });
const M = {}; for (const n of ["cobble","wall","cope","tower","brick","brickDark","iron","steel","wood","glass","mat4","mat9"]) M[n] = named(n);

const faces = [];
const b = { add: (g, m) => {
  const p = g.attributes.position?.array;
  if (!p) return;
  let best = 0, total = 0, ntri = 0;
  for (let i = 0; i < p.length; i += 9) {
    const A = [p[i], p[i+1], p[i+2]], B = [p[i+3], p[i+4], p[i+5]], C = [p[i+6], p[i+7], p[i+8]];
    const d = (u, v) => Math.hypot(u[0]-v[0], u[1]-v[1], u[2]-v[2]);
    const e = Math.max(d(A,B), d(B,C), d(C,A));
    if (e > best) best = e;
    total += e; ntri++;
  }
  if (best > 0.5) faces.push({ mat: m.__name, best, ntri, avg: total / ntri });
} };

for (const fn of ["palace", "terrace", "farBank", "sewer", "chamber"]) {
  const mark = faces.length;
  try { parl[fn](b, M, ...(fn === "palace" ? [48, {}] : [])); }
  catch (e) { console.log(`  (${fn} threw: ${e.message.slice(0,60)})`); }
  for (let i = mark; i < faces.length; i++) faces[i].src = fn;
}

faces.sort((a, b) => b.best - a.best);
console.log("longest triangle edge per face (only faces with an edge > 15 m shown):");
const seen = new Set();
for (const f of faces) {
  if (f.best < 15) break;
  const k = `${f.mat}:${f.best.toFixed(1)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  ${(f.src||"?").padEnd(9)} ${f.mat.padEnd(10)} edge ${f.best.toFixed(1).padStart(7)} m   tris/face ${String(f.ntri).padStart(3)}`);
}
