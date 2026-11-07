// ensure-browser.mjs — get a Chrome Headless Shell onto a machine that has none, and
// print the path. Remotion 4 downloads its own; we try that first, then fall back.
//
// Usage: node tools/ensure-browser.mjs
// On CI, writes CHROME=<path> to $GITHUB_ENV so later steps inherit it.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findChrome } from "./chrome.mjs";

const say = (m) => console.log(`ensure-browser: ${m}`);

function tryApi() {
  return import("@remotion/renderer")
    .then((m) => (typeof m.ensureBrowser === "function" ? m.ensureBrowser({ logLevel: "info" }) : null))
    .then((p) => (p ? true : false))
    .catch((e) => {
      say(`renderer.ensureBrowser unavailable: ${String(e.message || e).slice(0, 160)}`);
      return false;
    });
}

function tryCli() {
  try {
    execFileSync("npx", ["--yes", "remotion", "browser", "ensure"], { stdio: "inherit" });
    return true;
  } catch (e) {
    say(`npx remotion browser ensure failed: ${String(e.message || e).slice(0, 160)}`);
    return false;
  }
}

function tryPlaywright() {
  try {
    execFileSync("npx", ["--yes", "playwright@1.49.0", "install", "--with-deps", "chromium"], { stdio: "inherit" });
    return true;
  } catch (e) {
    say(`playwright install failed: ${String(e.message || e).slice(0, 160)}`);
    return false;
  }
}

let found = findChrome();
if (!found) {
  say("no chrome found, trying Remotion's downloader");
  if (!(await tryApi())) {
    say("falling back to the Remotion CLI");
    if (!tryCli()) {
      say("falling back to playwright");
      tryPlaywright();
    }
  }
  found = findChrome();
}

if (!found) {
  console.error("ensure-browser: STILL no chrome. Cannot render.");
  process.exit(1);
}

say(`chrome at ${found}`);
const env = process.env.GITHUB_ENV;
if (env) {
  fs.appendFileSync(env, `CHROME=${found}\n`);
  say(`wrote CHROME to GITHUB_ENV`);
}
// Also write a small json so the workflow can read it without parsing logs.
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/chrome.json", JSON.stringify({ chrome: found }, null, 1));
