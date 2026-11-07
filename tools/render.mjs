// render.mjs — render the short (or a slice) through @remotion/renderer, the ONLY way that
// works reliably. `npx remotion` fails on some boxes: "could not determine executable to run".
//
// Usage (from the project folder):
//   node tools/render.mjs <out.mp4> <start> <end> [scale] [crf] [conc]
//   scale 0.4 = 432x768 proxy   |   scale 4/3 = 1440x2560 FINAL (never 1.3333: odd width)
// Env: COMP=<CompositionId> (default MyShort), ENTRY=<entry> (default src/index.ts),
//      GL=angle-egl (default; on a GPU-less runner use swangle), LOG=<render.log>
//
// Everything below that looks paranoid is a scar from a real failed render. Keep it.
import fs from "node:fs";
import path from "node:path";
import { resolveChromeOrExit, chromiumOptions } from "./chrome.mjs";

const [outRaw, start, end, scaleArg = "0.4", crf = "24", conc = "4"] = process.argv.slice(2);
if (!outRaw || start === undefined || end === undefined) {
  console.error("usage: render.mjs <out.mp4> <start> <end> [scale] [crf] [conc]");
  process.exit(1);
}

// Scale accepts "4/3" as well as "1.3333". The skill documents `4/3` everywhere, but a
// bare Number("4/3") is NaN, which Remotion rejects deep inside the render. Parse both.
function num(v, name) {
  const s = String(v).trim();
  const m = s.match(/^(\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/);
  const n = m ? Number(m[1]) / Number(m[2]) : Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`bad ${name}: "${v}"`);
    process.exit(1);
  }
  return n;
}
const scale = num(scaleArg, "scale");

const out = path.resolve(outRaw);
fs.mkdirSync(path.dirname(out), { recursive: true });

// TEMP on a big drive: every Remotion bundle copies public/ into the temp dir and never
// cleans up. Point it at a dedicated folder, not the system temp.
const TMP = process.env.REMOTION_TMP || "/tmp/remotion-tmp";
fs.mkdirSync(TMP, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP = TMP;

const be = resolveChromeOrExit();
const { gl, chromiumOptions: opts } = chromiumOptions();
console.log(`gl: ${gl}   scale: ${scale}   frames: ${start}-${end}   crf: ${crf}   concurrency: ${conc}`);

const { bundle } = await import("@remotion/bundler");
const { renderMedia, selectComposition } = await import("@remotion/renderer");

const entry = process.env.ENTRY || "src/index.ts";
if (!fs.existsSync(entry)) {
  console.error(`no entry at ${entry} — set ENTRY=`);
  process.exit(1);
}

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
console.log(`composition ${comp.id} ${comp.width}x${comp.height} ${comp.durationInFrames}f @ ${comp.fps}fps -> ${Math.round(comp.width * scale)}x${Math.round(comp.height * scale)}`);

// end frame must be INSIDE the film or renderMedia throws from deep inside after the bundle.
if (Number(end) >= comp.durationInFrames) {
  console.error(`end frame ${end} is past the film (${comp.durationInFrames} frames)`);
  process.exit(1);
}
if (Math.round(comp.width * scale) % 2 !== 0) {
  console.error(`scaled width ${comp.width * scale} is odd — h264 rejects it. Use 4/3, not 1.3333.`);
  process.exit(1);
}

// Log every browser error line to the render log — the qa-gate greps this file for 404s.
// A 404 does NOT fail the render; without this log the missing props are invisible.
const LOG = process.env.LOG || out.replace(/\.mp4$/, ".log");
const log = fs.createWriteStream(LOG, { flags: "w" });
const orig = console.log.bind(console);
console.log = (...a) => {
  orig(...a);
  log.write(a.join(" ") + "\n");
};
const onBrowserLog = (l) => {
  if (l.type === "error") console.log("[browser]", l.text.slice(0, 240));
};

// Progress: report the DELTA between frames. An average counts browser launch + first-frame
// shader compile (~40 s), so an honest 2 s/frame render reads as "20 s/frame" for 100 frames.
let last = -1;
let lastT = 0;
const onProgress = ({ renderedFrames }) => {
  if (renderedFrames === last) return;
  const now = Date.now();
  const per = lastT ? (now - lastT) / 1000 : 0;
  lastT = now;
  const span = Number(end) - Number(start) + 1;
  const left = (span - renderedFrames) * per;
  console.log(
    `frame ${Number(start) + renderedFrames - 1}/${end}  ${per.toFixed(1)} s/frame  ~${(left / 60).toFixed(1)} min left`,
  );
  last = renderedFrames;
};

const errs = [];
await renderMedia({
  composition: comp,
  serveUrl,
  codec: "h264",
  crf: Number(crf),
  outputLocation: out,
  frameRange: [Number(start), Number(end)],
  scale,
  concurrency: Number(conc),
  browserExecutable: be,
  chromiumOptions: opts,
  timeoutInMilliseconds: 900000,
  logLevel: "warn",
  // MUTED IS NOT OPTIONAL for chunked rendering. Remotion writes a silent AAC track
  // whose length does not match the video (a 2.000 s video gets a 2.048 s track). Two
  // such chunks concatenated with -c copy leave a 48 ms hole at the join and a bogus
  // frame rate. The real audio is muxed once at the end, so strip it here.
  muted: true,
  onProgress,
  onBrowserLog,
  onLog: (l) => {
    const t = l.text;
    if (/Error|undefined is not|Cannot read|throw|404|Failed to load/i.test(t) && !t.startsWith("[compositor]")) {
      errs.push(t.slice(0, 200));
    }
  },
});
console.log(`render done: ${out}  ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
console.log(`render log:  ${LOG}  (pass it to qa-gate.sh as arg 2)`);
if (errs.length) console.log("BROWSER ERRORS:", [...new Set(errs)].slice(0, 8).join("\n  "));
