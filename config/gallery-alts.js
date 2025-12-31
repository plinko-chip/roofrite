// config/gallery-alts.js
const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");

// ===== Settings =====
const MANIFEST = "_gallery-alts.json";
const IMG_GLOBS = ["*.jpg", "*.jpeg", "*.png", "*.webp", "*.gif", "*.avif"];

// Default alt when the manifest value is "" (explicit empty)
// Change this once, it applies everywhere.
const DEFAULT_GALLERY_ALT = "Project photo from our gallery.";

// ===== Helpers =====
function humanizeFilename(file) {
  const stem = file.replace(/\.[^.]+$/, "");
  return stem
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase()); // Title Case
}

/**
 * Sync a folder’s _gallery-alts.json to current files.
 * - Adds new files with empty string "" (devs can fill later)
 * - Removes missing files
 * - Alphabetizes
 */
function syncGalleryAlts(dirAbs) {
  const files = fg.sync(IMG_GLOBS, { cwd: dirAbs, onlyFiles: true }).sort();
  const manifestPath = path.join(dirAbs, MANIFEST);

  let data = {};
  if (fs.existsSync(manifestPath)) {
    try {
      data = JSON.parse(fs.readFileSync(manifestPath, "utf8")) || {};
    } catch {
      data = {};
    }
  }

  const next = {};
  for (const f of files) {
    next[f] = Object.prototype.hasOwnProperty.call(data, f) ? data[f] : "";
  }

  const prevStr = JSON.stringify(data, null, 2);
  const nextStr = JSON.stringify(next, null, 2);
  if (prevStr !== nextStr) {
    fs.writeFileSync(manifestPath, nextStr + "\n", "utf8");
  }

  return next;
}

/**
 * Resolve alt text for a given file from the manifest.
 * Rules:
 * - If value is a non-empty string => use it
 * - If value is "" => use DEFAULT_GALLERY_ALT
 * - If key missing/undefined => fallback to humanized filename
 */
function altForFile(manifest, file) {
  const raw = manifest[file];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return { alt: trimmed };
    return { alt: DEFAULT_GALLERY_ALT };
  }
  return { alt: humanizeFilename(file) };
}

/**
 * (Optional) Pre-sync every immediate subfolder that contains images.
 * Use if you want to generate manifests across an entire base directory.
 */
function syncAllUnder(baseDirAbs) {
  const dirs = fg.sync(["*"], { cwd: baseDirAbs, onlyDirectories: true });
  for (const d of dirs) {
    const dirAbs = path.join(baseDirAbs, d);
    const hasImgs = fg.sync(IMG_GLOBS, { cwd: dirAbs, onlyFiles: true }).length > 0;
    if (hasImgs) syncGalleryAlts(dirAbs);
  }
}

module.exports = {
  MANIFEST,
  DEFAULT_GALLERY_ALT,
  syncGalleryAlts,
  altForFile,
  humanizeFilename,
  syncAllUnder, // optional
};
