// chrome.mjs — find a browser and build the Chrome flags, on a workstation OR a GPU-less CI runner.
//
// The skill's render.mjs/still.mjs were written for a box with a real GPU: they look in the
// playwright cache and default to GL=angle-egl. On GitHub Actions there is NO GPU, so
// angle-egl has no EGL device to talk to and WebGL silently produces black frames.
// This module centralises the discovery + flag logic so both scripts agree.
//
// Env:
//   CHROME             explicit path to a chrome / chrome-headless-shell binary
//   GL                 angle-egl | swangle | angle | swiftshader | egl | vulkan
//   EXTRA_CHROME_ARGS  extra flags, space separated
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const globDirs = (root, suffix) => {
  try {
    return fs.readdirSync(root).map((v) => path.join(root, v, suffix)).filter((p) => fs.existsSync(p));
  } catch {
    return [];
  }
};

/** A path is only a candidate if the binary actually RUNS. A file that exists and
 *  segfaults (seen: Remotion's download on a bleeding-edge kernel) is worse than no
 *  browser at all, because the error surfaces as "Failed to launch the browser process"
 *  three layers deep. `--version` is cheap and exits. */
function runs(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    const r = spawnSync(p, ["--version"], { timeout: 20000, encoding: "utf8" });
    if (r.status !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

export function findChrome() {
  const home = process.env.HOME || "";
  const candidates = [
    process.env.CHROME,
    // system installs first on a workstation: a distro-packaged Chrome is built against
    // this machine's glibc and libs, while Remotion's prebuilt shell may not be.
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    // Remotion's own pinned download — this is what `npx remotion browser ensure` fills,
    // and the only one Remotion 4.0.210 uses by default. On CI this is the right one.
    path.join(process.cwd(), "node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"),
    ...globDirs(path.join(process.cwd(), "node_modules/.remotion/chrome-headless-shell/linux64"), "chrome-headless-shell"),
    // playwright cache (the original skill's assumption)
    ...globDirs(path.join(home, ".cache/ms-playwright"), "chrome-linux/headless_shell"),
    ...globDirs(path.join(home, ".cache/ms-playwright"), "chrome-linux/chrome"),
    // the old /opt layout on the author's box
    "/opt/browser/chrome-headless-shell-linux64/chrome-headless-shell",
  ].filter(Boolean);
  for (const p of candidates) {
    if (!runs(p)) continue;
    return p;
  }
  return undefined;
}

const SOFTWARE_GL = new Set(["swangle", "swiftshader"]);

export function chromiumOptions() {
  const gl = process.env.GL || "angle-egl";
  const extra = (process.env.EXTRA_CHROME_ARGS || "").split(/\s+/).filter(Boolean);
  // NOTE (verified against remotion 4.0.210 source): ChromiumOptions has NO `args` field.
  // open-browser.ts never spreads it, so the flags below are SILENTLY DROPPED. They are
  // kept because newer Remotion honours them and they cost nothing, but do not rely on
  // them: the real defence against WebGL context eviction is concurrency=1, which is why
  // the workflow renders each chunk with a single browser tab.
  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--home=/tmp",
    "--max-active-webgl-contexts=64",
    "--disable-gpu-process-crash-limit",
  ];
  if (SOFTWARE_GL.has(gl)) {
    // Chrome 119+ refuses software WebGL unless this flag is present. Without it the
    // context creation fails and three.js draws nothing — the render still "succeeds".
    args.push("--enable-unsafe-swiftshader");
  }
  return { gl, chromiumOptions: { gl, args: [...args, ...extra] } };
}

export function resolveChromeOrExit() {
  const be = findChrome();
  if (!be) {
    console.error("No chrome found — set CHROME=<path to chrome or chrome-headless-shell>");
    console.error("On CI: npx remotion browser ensure   (or)   npx playwright install chromium");
    process.exit(1);
  }
  console.log(`chrome: ${be}`);
  return be;
}
