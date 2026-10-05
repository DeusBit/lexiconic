#!/usr/bin/env node
/**
 * build.js — Copies extension source files into dist/
 *
 * The dist/ directory contains only the files that belong inside
 * the Chrome extension package. Everything else (tooling, scripts,
 * startup helpers, etc.) is intentionally excluded.
 *
 * Usage:  node scripts/build.js
 *         npm run build
 */

const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

/** Files and directories that belong in the packed extension. */
const INCLUDE = [
  "manifest.json",
  "background.js",
  "content.js",
  "styles.css",
  // Popup widget
  "popup",
  // Include icon directories if they exist
  "icons",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Files/names to exclude from the built extension dist */
const EXCLUDE = new Set([
  "icon_x500.png",
]);

function copyFileOrDir(src, dest) {
  if (EXCLUDE.has(path.basename(src))) {
    return;
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyFileOrDir(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("🔨 Building Lexiconic extension...\n");

// Clean dist/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

let copied = 0;

for (const entry of INCLUDE) {
  const src  = path.join(ROOT, entry);
  const dest = path.join(DIST, entry);

  if (!fs.existsSync(src)) {
    // Optional entries (e.g. icons/) — skip silently if absent
    continue;
  }

  copyFileOrDir(src, dest);
  console.log(`  ✅  ${entry}`);
  copied++;
}

// ---------------------------------------------------------------------------
// Quick sanity-check: manifest must declare manifest_version 3
// ---------------------------------------------------------------------------

const manifestPath = path.join(DIST, "manifest.json");
const manifest     = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  console.error("\n  ❌ manifest_version must be 3. Aborting.");
  process.exit(1);
}

console.log(`\n✔  Build complete — ${copied} file(s) copied to dist/`);
console.log(`   Extension version: ${manifest.version}`);
console.log(`   Name: ${manifest.name}\n`);
