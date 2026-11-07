// probe.mjs — DOES WEBGL ACTUALLY DRAW HERE? Run this BEFORE spending hours on a render.
//
// The failure mode this exists to catch: headless Chrome with no GPU creates a WebGL
// context, three.js "renders", Remotion exits 0, and every frame is black. Nothing in the
// render log says so. On GitHub Actions that would cost hours of runner time and produce
// a dead video, so we spend 5 minutes proving pixels exist first.
//
// Usage:  node tools/probe.mjs <frame> [more frames...]
// Env:    GL, CHROME, ENTRY, COMP, STILL_SCALE (default 0.25)
// Exit:   0 = drawn, 1 = blank/failed
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveChromeOrExit, chromiumOptions } from "./chrome.mjs";

const frames = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (!frames.length) {
  console.error("usage: probe.mjs <frame> [more...]");
  process.exit(1);
}

const TMP = process.env.REMOTION_TMP || "/tmp/remotion-tmp";
fs.mkdirSync(TMP, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP = TMP;

const be = resolveChromeOrExit();
const { gl, chromiumOptions: opts } = chromiumOptions();
console.log(`gl: ${gl}`);

const { bundle } = await import("@remotion/bundler");
const { renderStill, selectComposition } = await import("@remotion/renderer");

const entry = process.env.ENTRY || "src/index.ts";
if (!fs.existsSync(entry)) {
  console.error(`no entry at ${entry} — set ENTRY=`);
  process.exit(1);
}

const scale = Number(process.env.STILL_SCALE || 0.25);
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.resolve(entry), publicDir: path.resolve("public") });
console.log(`bundle ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const comp = await selectComposition({
  serveUrl,
  id: process.env.COMP || "MyShort",
  browserExecutable: be,
  chromiumOptions: opts,
  logLevel: "warn",
});
console.log(`composition ${comp.id} ${comp.width}x${comp.height} ${comp.durationInFrames}f @ ${comp.fps}fps`);
console.log(`probe scale ${scale} -> ${Math.round(comp.width * scale)}x${Math.round(comp.height * scale)}`);

fs.mkdirSync("out/probe", { recursive: true });

/** YAVG/YSTD from ffmpeg signalstats. A blank frame has YSTD ~ 0 and a flat YAVG. */
function stats(file) {
  try {
    const out = execFileSync(
      "ffmpeg",
      ["-hide_banner", "-i", file, "-vf", "signalstats,metadata=print", "-f", "null", "-"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return parseStats(out);
  } catch (e) {
    const s = `${e.stderr || ""}${e.stdout || ""}`;
    return parseStats(s);
  }
}

function parseStats(text) {
  const pick = (k) => {
    const m = text.match(new RegExp(`${k}=([0-9.]+)`));
    return m ? Number(m[1]) : null;
  };
  return { yavg: pick("lavfi.signalstats.YAVG"), ystd: pick("lavfi.signalstats.YSTD"), ymax: pick("lavfi.signalstats.YMAX") };
}

const results = [];
for (const f of frames) {
  if (f >= comp.durationInFrames) {
    console.log(`frame ${f} past film end (${comp.durationInFrames}) — skipped`);
    continue;
  }
  const out = `out/probe/${gl}_f_${String(f).padStart(4, "0")}.png`;
  const ts = Date.now();
  let ok = true;
  let err = "";
  try {
    await renderStill({
      composition: comp,
      serveUrl,
      frame: f,
      output: out,
      browserExecutable: be,
      chromiumOptions: opts,
      scale,
    });
  } catch (e) {
    ok = false;
    err = String(e && e.message ? e.message : e).slice(0, 300);
  }
  const secs = (Date.now() - ts) / 1000;
  if (!ok) {
    console.log(`frame ${f}  FAILED after ${secs.toFixed(1)}s: ${err}`);
    results.push({ f, ok: false, secs, err });
    continue;
  }
  const size = fs.statSync(out).size;
  const st = stats(out);
  const drawn = st.ystd !== null && st.ystd > 3 && size > 2000;
  console.log(
    `frame ${f}  ${secs.toFixed(1)}s  ${(size / 1024).toFixed(0)} KB  YAVG=${st.yavg} YSTD=${st.ystd} YMAX=${st.ymax}  ${drawn ? "DRAWN" : "BLANK"}`,
  );
  results.push({ f, ok: drawn, secs, size, ...st });
}

const good = results.filter((r) => r.ok);
console.log(`\nprobe: ${good.length}/${results.length} frames drawn with GL=${gl}`);

// Rough projection for the real render: stills pay browser-launch + shader-compile every
// time, so per-frame cost in a continuous render is lower. This is an UPPER bound.
if (good.length) {
  const per = Math.max(...good.map((r) => r.secs));
  console.log(`slowest still: ${per.toFixed(1)}s  -> worst case ${((per * comp.durationInFrames) / 3600).toFixed(1)} job-hours for ${comp.durationInFrames} frames`);
}

if (!good.length) {
  console.log("RESULT: NO PIXELS. Do not start a render. Try a different GL backend.");
  process.exit(1);
}
console.log("RESULT: WebGL draws here.");
