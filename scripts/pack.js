#!/usr/bin/env node
/**
 * pack.js — Creates a ZIP of dist/ ready for Chrome Web Store submission
 *
 * Run AFTER build.js (npm run pack does both automatically).
 *
 * Output: dist/lexiconic-<version>.zip
 *
 * Usage:  node scripts/pack.js        (after npm run build)
 *         npm run pack                (build + pack in one step)
 */

const fs       = require("fs");
const path     = require("path");
const archiver = require("archiver");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// Read version from manifest inside dist/
const manifestPath = path.join(DIST, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error("❌  dist/manifest.json not found. Run `npm run build` first.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version  = manifest.version || "0.0.0";
const zipName  = `lexiconic-${version}.zip`;
const zipPath  = path.join(DIST, zipName);

// ---------------------------------------------------------------------------
// Pack
// ---------------------------------------------------------------------------

console.log(`📦 Packing extension v${version}...\n`);

const output  = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

archive.on("warning", (err) => {
  if (err.code === "ENOENT") {
    console.warn("  ⚠️ ", err.message);
  } else {
    throw err;
  }
});

archive.on("error", (err) => { throw err; });

output.on("close", () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`✔  Packed: dist/${zipName}  (${kb} KB)`);
  console.log("\n   Upload this file to the Chrome Web Store Developer Dashboard:");
  console.log("   https://chrome.google.com/webstore/devconsole\n");
});

archive.pipe(output);

// Add every file in dist/ EXCEPT the zip itself and promotional/high-res source icons
archive.glob("**/*", {
  cwd:    DIST,
  ignore: [`${zipName}`, "**/icon_x500.png", "icons/icon_x500.png"],
});

archive.finalize();
