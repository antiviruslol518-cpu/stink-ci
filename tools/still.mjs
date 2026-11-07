// still.mjs — render single frames as PNGs for the LOOK step. Same chrome/GL rules as render.mjs.
// Usage: node tools/still.mjs <frame> [more frames...]   e.g. still.mjs 60 400 1000
// Env: COMP, ENTRY, GL, CHROME, STILL_SCALE (default 0.5)
import fs from "node:fs";
import path from "node:path";
import { resolveChromeOrExit, chromiumOptions } from "./chrome.mjs";

const frames = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (!frames.length) {
  console.error("usage: still.mjs <frame> [more...]");
  process.exit(1);
}

const TMP = process.env.REMOTION_TMP || "/tmp/remotion-tmp";
fs.mkdirSync(TMP, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP = TMP;

const be = resolveChromeOrExit();
const { chromiumOptions: opts } = chromiumOptions();

const { bundle } = await import("@remotion/bundler");
const { renderStill, selectComposition } = await import("@remotion/renderer");

const entry = process.env.ENTRY || "src/index.ts";
const serveUrl = await bundle({ entryPoint: path.resolve(entry), publicDir: path.resolve("public") });
const comp = await selectComposition({
  serveUrl,
  id: process.env.COMP || "MyShort",
  browserExecutable: be,
  chromiumOptions: opts,
  logLevel: "warn",
});

fs.mkdirSync("out/stills", { recursive: true });
for (const f of frames) {
  if (f >= comp.durationInFrames) {
    console.log(`frame ${f} past film end (${comp.durationInFrames}) — skipped`);
    continue;
  }
  const out = `out/stills/f_${String(f).padStart(4, "0")}.png`;
  await renderStill({
    composition: comp,
    serveUrl,
    frame: f,
    output: out,
    browserExecutable: be,
    chromiumOptions: opts,
    scale: Number(process.env.STILL_SCALE || 0.5),
  });
  const size = fs.statSync(out).size;
  // A BLANK frame costs the same bytes as a drawn one — but a near-empty PNG (tiny size
  // relative to the resolution) is a strong blank-frame signal. Look at it anyway.
  console.log(`still ${out}  ${(size / 1024).toFixed(0)} KB  <- OPEN THIS AND LOOK AT IT`);
}
