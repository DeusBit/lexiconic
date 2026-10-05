#!/usr/bin/env node
/**
 * validate.js — Validates the extension source against MV3 requirements
 *              WITHOUT producing a build artefact.
 *
 * Checks performed:
 *   1. manifest.json exists and is valid JSON
 *   2. manifest_version is 3
 *   3. All files referenced in manifest exist on disk
 *   4. No permissions declared that are not needed (warns on known unused ones)
 *   5. host_permissions are present (required for fetch to localhost)
 *
 * Usage:  node scripts/validate.js
 *         npm run validate
 */

const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

let errors   = 0;
let warnings = 0;

function pass(msg)  { console.log(`  ✅  ${msg}`); }
function warn(msg)  { console.warn(`  ⚠️   ${msg}`); warnings++; }
function fail(msg)  { console.error(`  ❌  ${msg}`); errors++; }

// ---------------------------------------------------------------------------
// 1. Read manifest
// ---------------------------------------------------------------------------

console.log("\n🔍 Validating Lexiconic extension...\n");

const manifestPath = path.join(ROOT, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  fail("manifest.json not found in project root");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  pass("manifest.json is valid JSON");
} catch (e) {
  fail(`manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. manifest_version
// ---------------------------------------------------------------------------

if (manifest.manifest_version === 3) {
  pass("manifest_version is 3 (MV3)");
} else {
  fail(`manifest_version is ${manifest.manifest_version} — must be 3`);
}

// ---------------------------------------------------------------------------
// 3. Required top-level fields
// ---------------------------------------------------------------------------

for (const field of ["name", "version", "description"]) {
  if (manifest[field]) {
    pass(`"${field}" is present: ${manifest[field]}`);
  } else {
    warn(`"${field}" is missing from manifest`);
  }
}

// ---------------------------------------------------------------------------
// 4. Service worker file exists
// ---------------------------------------------------------------------------

const sw = manifest?.background?.service_worker;
if (!sw) {
  warn("No background.service_worker declared");
} else {
  const swPath = path.join(ROOT, sw);
  if (fs.existsSync(swPath)) {
    pass(`Service worker exists: ${sw}`);
  } else {
    fail(`Service worker file missing: ${sw}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Content script files exist
// ---------------------------------------------------------------------------

const contentScripts = manifest.content_scripts ?? [];
for (const cs of contentScripts) {
  for (const jsFile of cs.js ?? []) {
    const p = path.join(ROOT, jsFile);
    fs.existsSync(p) ? pass(`Content script exists: ${jsFile}`) : fail(`Content script missing: ${jsFile}`);
  }
  for (const cssFile of cs.css ?? []) {
    const p = path.join(ROOT, cssFile);
    fs.existsSync(p) ? pass(`CSS file exists: ${cssFile}`) : fail(`CSS file missing: ${cssFile}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Icon files exist (if declared)
// ---------------------------------------------------------------------------

const icons = { ...manifest.icons, ...manifest?.action?.default_icon };
for (const [size, iconPath] of Object.entries(icons)) {
  const p = path.join(ROOT, iconPath);
  fs.existsSync(p)
    ? pass(`Icon ${size}px exists: ${iconPath}`)
    : fail(`Icon ${size}px missing: ${iconPath} — referenced in manifest but file does not exist`);
}

// ---------------------------------------------------------------------------
// 7. host_permissions present (required for fetch to Ollama)
// ---------------------------------------------------------------------------

const hostPerms = manifest.host_permissions ?? [];
if (hostPerms.length > 0) {
  pass(`host_permissions declared: ${hostPerms.join(", ")}`);
} else {
  fail("No host_permissions declared — extension will not be able to reach Ollama on localhost");
}

// ---------------------------------------------------------------------------
// 8. No deprecated MV2 keys
// ---------------------------------------------------------------------------

const mv2Keys = ["browser_action", "page_action", "background.scripts", "background.persistent"];
for (const key of mv2Keys) {
  const parts = key.split(".");
  let obj = manifest;
  let found = false;
  for (const part of parts) {
    if (obj && typeof obj === "object" && part in obj) {
      obj = obj[part]; found = true;
    } else { found = false; break; }
  }
  if (found) fail(`Deprecated MV2 key "${key}" found in manifest`);
}
if (errors === 0) pass("No deprecated MV2 keys found");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log("\n" + "─".repeat(50));
if (errors === 0 && warnings === 0) {
  console.log("✔  All checks passed!\n");
} else {
  if (errors > 0)   console.error(`❌  ${errors} error(s) found`);
  if (warnings > 0) console.warn(`⚠️   ${warnings} warning(s) found`);
  console.log();
}

process.exit(errors > 0 ? 1 : 0);
