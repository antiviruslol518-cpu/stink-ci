// still.mjs — render single frames as PNGs for the LOOK step. Same chrome/GL rules as render.mjs.
// Usage: node tools/still.mjs <frame> [more frames...]   e.g. still.mjs 60 400 1000
// Env: COMP, ENTRY, GL, CHROME, STILL_SCALE (default 0.5)
//      STILL_PROPS  JSON inputProps, e.g. '{"post":{"ink":false}}' — the A/B switches in
//                   Bridge.tsx let a post pass be turned off one at a time, which is how a
//                   one-frame artifact gets traced to the pass that drew it.
//      STILL_TAG    suffix for the output name, so two A/B runs do not overwrite each other.
import fs from "node:fs";
import path from "node:path";
import { resolveChromeOrExit, chromiumOptions } from "./chrome.mjs";

// Accept commas as well as spaces. The workflow's `frames` input is filled in by hand and
// "599,600,601" is the natural way to type it; a bare argv split turns that into one NaN,
// the filter drops it, and the script exits "successfully" having rendered nothing.
const frames = process.argv.slice(2).join(" ").split(/[\s,]+/)
  .filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
if (!frames.length) {
  console.error("usage: still.mjs <frame> [more...]");
  process.exit(1);
}

const TAG = process.env.STILL_TAG || "";
let inputProps = {};
if (process.env.STILL_PROPS) {
  try { inputProps = JSON.parse(process.env.STILL_PROPS); }
  catch (e) { console.error(`STILL_PROPS is not valid JSON: ${e.message}`); process.exit(1); }
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
  inputProps,
  logLevel: "warn",
});

fs.mkdirSync("out/stills", { recursive: true });
for (const f of frames) {
  if (f >= comp.durationInFrames) {
    console.log(`frame ${f} past film end (${comp.durationInFrames}) — skipped`);
    continue;
  }
  const out = `out/stills/f_${String(f).padStart(4, "0")}${TAG}.png`;
  await renderStill({
    composition: comp,
    serveUrl,
    frame: f,
    output: out,
    inputProps,
    browserExecutable: be,
    chromiumOptions: opts,
    scale: Number(process.env.STILL_SCALE || 0.5),
    // The first still pays shader compile for the whole post chain. Remotion's default
    // page-function timeout is 30 s, which a three.js scene blows past on software WebGL.
    timeoutInMilliseconds: Number(process.env.STILL_TIMEOUT_MS || 180000),
    // Forward PAGE console output to this process. Without it a diagnostic printed from a
    // shader path never leaves the headless browser, and the only way to read a number out of
    // the render is to encode it into the PNG — which the tone/grade chain then destroys.
    onBrowserLog: (log) => {
      if (log.type === "warning" || log.type === "error" || /INKPROBE|PROBE/.test(log.text)) {
        console.log(`[page:${log.type}] ${log.text}`);
      }
    },
  });
  const size = fs.statSync(out).size;
  // A BLANK frame costs the same bytes as a drawn one — but a near-empty PNG (tiny size
  // relative to the resolution) is a strong blank-frame signal. Look at it anyway.
  console.log(`still ${out}  ${(size / 1024).toFixed(0)} KB  <- OPEN THIS AND LOOK AT IT`);
}
