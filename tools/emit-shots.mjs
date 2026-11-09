// emit-shots.mjs — write shots.json FROM story.ts, so the QA gate can never disagree
// with the film about where the cuts are.
//
// Why this exists: qa-gate.sh treats every frame-diff spike it did not plan for as a
// "pop" (a glitch). Every hard cut IS a spike. If shots.json drifts from story.ts by a
// single frame the gate fails on a film that is actually fine — or, worse, a real pop
// hides inside a stale planned window. So shots.json is never hand-written: it is
// derived from the same SHOTS / XFADE / FLASH_AT the renderer uses.
//
// story.ts is TypeScript, so it is bundled to ESM with esbuild first and imported.
//
// Usage: node tools/emit-shots.mjs [outfile]      (default: shots.json)
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const OUT = path.resolve(process.argv[2] || "shots.json");
const ENTRY = path.resolve("src/videos/stink/story.ts");

if (!fs.existsSync(ENTRY)) {
  console.error(`emit-shots: no story.ts at ${ENTRY} — run from the project folder`);
  process.exit(1);
}

// story.ts imports nothing but pure constants and small helpers, but bundle anyway so a
// future `import { X } from "./y"` cannot break this.
const res = await build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2020",
  logLevel: "silent",
});
const code = res.outputFiles[0].text;
const mod = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const { TOTAL, SHOTS, XFADE, FLASH_AT, KICKS, KICK_FRAMES, FPS: FPSX } = mod;
if (!Number.isFinite(TOTAL) || !Array.isArray(SHOTS) || !SHOTS.length) {
  console.error("emit-shots: story.ts did not export TOTAL + a non-empty SHOTS array");
  process.exit(1);
}

// --- integrity: the shots must tile the film with no gap and no overlap -------------
// A gap means a frame belongs to no shot (shotAt() silently falls back to the last one);
// an overlap means two shots claim a frame. Both produce invisible timing bugs.
const problems = [];
if (SHOTS[0].a !== 0) problems.push(`first shot starts at ${SHOTS[0].a}, not 0`);
for (let i = 0; i < SHOTS.length; i++) {
  const s = SHOTS[i];
  if (s.b <= s.a) problems.push(`shot ${s.id}: empty range ${s.a}..${s.b}`);
  if (i > 0) {
    const p = SHOTS[i - 1];
    if (s.a !== p.b) problems.push(`shot ${s.id} starts at ${s.a} but shot ${p.id} ends at ${p.b}`);
  }
}
const last = SHOTS[SHOTS.length - 1];
if (last.b !== TOTAL) problems.push(`last shot ends at ${last.b}, TOTAL is ${TOTAL}`);
if (problems.length) {
  console.error("emit-shots: SHOTS do not tile the film:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

// --- planned windows: every cut, every crossfade, the flash ------------------------
// short_qa.py marks range(a-1, b+1) for each entry, so a window is [start, end) in frames.
const xfade = [];
for (const [id, x] of Object.entries(XFADE ?? {})) {
  const s = SHOTS.find((q) => q.id === Number(id));
  if (!s) continue;
  const half = Math.floor(x / 2);
  xfade.push([Math.max(0, s.a - half), Math.min(TOTAL, s.a + half + 1)]);
}

// --- impact kicks: a DESIGNED camera shake, not a glitch --------------------------------
// kickAt() starts at the first frame at/after t0 and moves the camera for KICK_FRAMES, so the
// spike lives in frames ceil(t0*FPS) .. that + KICK_FRAMES. Declare one frame of slack either
// side: the diff between frame f and f+1 can belong to either, and rounding of t0*FPS is not
// guaranteed to land on the same side as the renderer's floor().
const fps = FPSX ?? 30;
const kicks = (KICKS ?? []).map(([t0]) => {
  const start = Math.floor(t0 * fps + 1e-6);
  return [Math.max(0, start - 1), Math.min(TOTAL, start + (KICK_FRAMES ?? 7) + 1)];
});

const meta = {
  total: TOTAL,
  fps,
  duration: Number((TOTAL / fps).toFixed(3)),
  shots: SHOTS.map((s) => ({ id: s.id, a: s.a, b: s.b })),
  xfade,
  // every hard cut is a legit frame-diff spike; the gate must not call it a pop
  cuts: SHOTS.slice(1).map((s) => s.a),
  ...(Number.isFinite(FLASH_AT) ? { flash: [FLASH_AT, FLASH_AT + 4] } : {}),
  // the designed impact shakes, for the same reason as the cuts
  ...(kicks.length ? { kicks } : {}),
};

fs.writeFileSync(OUT, JSON.stringify(meta, null, 2) + "\n");
console.log(`emit-shots: ${OUT}`);
console.log(`  ${SHOTS.length} shots, ${TOTAL} frames (${meta.duration}s @ ${meta.fps}fps)`);
console.log(`  ${meta.cuts.length} cuts, ${xfade.length} crossfades${meta.flash ? ", 1 flash" : ""}${kicks.length ? `, ${kicks.length} impact kicks` : ""}`);
for (const [a, b] of kicks) console.log(`    kick frames ${a}-${b - 1}`);
