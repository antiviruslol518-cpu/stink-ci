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

const globDirs = (root, suffix) => {
  try {
    return fs.readdirSync(root).map((v) => path.join(root, v, suffix)).filter((p) => fs.existsSync(p));
  } catch {
    return [];
  }
};

export function findChrome() {
  const home = process.env.HOME || "";
  const candidates = [
    process.env.CHROME,
    // playwright cache (the original skill's assumption)
    ...globDirs(path.join(home, ".cache/ms-playwright"), "chrome-linux/headless_shell"),
    ...globDirs(path.join(home, ".cache/ms-playwright"), "chrome-linux/chrome"),
    // Remotion's own download (what `npx remotion browser ensure` populates)
    path.join(home, ".cache/remotion/chrome-headless-shell/linux64/chrome-headless-shell"),
    path.join(home, ".cache/remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell"),
    ...globDirs(path.join(home, ".cache/remotion"), "chrome-headless-shell-linux64/chrome-headless-shell"),
    // the old /opt layout on the author's box
    "/opt/browser/chrome-headless-shell-linux64/chrome-headless-shell",
    // system installs (apt / ubuntu-latest images)
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

const SOFTWARE_GL = new Set(["swangle", "swiftshader"]);

export function chromiumOptions() {
  const gl = process.env.GL || "angle-egl";
  const extra = (process.env.EXTRA_CHROME_ARGS || "").split(/\s+/).filter(Boolean);
  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--home=/tmp",
    // Chrome caps LIVE WebGL contexts at 8 and silently evicts the oldest -> permanently
    // blank canvas. A crossfade mounts a SECOND canvas. Never remove this.
    "--max-active-webgl-contexts=64",
    // Chrome falls back to SwiftShader after a few GPU crashes, silently changing
    // rasterizer mid-render. A multi-hour render must not do that.
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
