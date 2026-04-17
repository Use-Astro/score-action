// Adapted from Astro-Website/services/score-api/src/repo.js.
//
// The Action runs after `actions/checkout@v4` has already placed the repo on
// disk, so all download/extract/S3 logic from the source has been removed.
// Only the file-walker, file-reader, and package.json finder survive. These
// are the entry points checks/context.js depends on. Limits and exclude lists
// are kept identical to the source so file selection matches the web scanner.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative, extname } from "node:path";

const MAX_FILE_SIZE = 102_400;
const MAX_FILE_COUNT = 10_000;
const MAX_AGGREGATE_BYTES = 52_428_800;

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "out", "coverage",
  "vendor", "__pycache__", ".cache", ".turbo", ".vercel", ".serverless",
  "tmp", ".output", ".nuxt", ".svelte-kit", ".parcel-cache", ".webpack",
  "storybook-static", ".docusaurus",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp", ".avif",
  ".mp3", ".mp4", ".wav", ".ogg", ".webm", ".avi", ".mov",
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".sqlite", ".db",
]);

function isExcludedDir(name) {
  return EXCLUDED_DIRS.has(name);
}

function isBinaryFile(filePath) {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function getRepoFiles(dir) {
  const resolvedDir = resolve(dir);
  const files = [];
  let aggregateBytes = 0;
  let truncated = false;

  function walk(currentDir) {
    if (files.length >= MAX_FILE_COUNT) {
      truncated = true;
      return;
    }

    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILE_COUNT) {
        return;
      }

      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(resolvedDir, fullPath);

      if (entry.isDirectory()) {
        if (!isExcludedDir(entry.name) && !entry.isSymbolicLink()) {
          walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile() || entry.isSymbolicLink()) {
        continue;
      }

      if (isBinaryFile(entry.name)) {
        continue;
      }

      let stat;
      try {
        stat = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (stat.size > MAX_FILE_SIZE) {
        continue;
      }

      if (aggregateBytes >= MAX_AGGREGATE_BYTES) {
        continue;
      }

      aggregateBytes += stat.size;

      files.push({
        relativePath,
        absPath: fullPath,
      });
    }
  }

  walk(resolvedDir);

  if (truncated) {
    console.warn("repo_files_truncated", {
      max_files: MAX_FILE_COUNT,
      actual_counted: files.length,
      dir: resolvedDir,
    });
  }

  return files;
}

function readRepoFile(filePath, maxBytes = MAX_FILE_SIZE) {
  try {
    const buffer = readFileSync(filePath);
    if (buffer.length > maxBytes) {
      return buffer.subarray(0, maxBytes).toString("utf-8");
    }
    return buffer.toString("utf-8");
  } catch {
    return "";
  }
}

function findPackageJson(dir) {
  const resolvedDir = resolve(dir);

  const rootPkg = join(resolvedDir, "package.json");
  if (existsSync(rootPkg)) {
    try {
      const rootContent = JSON.parse(readFileSync(rootPkg, "utf-8"));
      if (rootContent.workspaces) {
        const workspaceDirs = Array.isArray(rootContent.workspaces)
          ? rootContent.workspaces
          : rootContent.workspaces.packages ?? [];

        for (const pattern of workspaceDirs) {
          const baseDir = pattern.replace(/\/?\*.*$/, "");
          const searchDir = join(resolvedDir, baseDir);
          if (!existsSync(searchDir)) continue;

          let entries;
          try {
            entries = readdirSync(searchDir, { withFileTypes: true });
          } catch {
            continue;
          }

          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgPath = join(searchDir, entry.name, "package.json");
              if (existsSync(pkgPath)) {
                return pkgPath;
              }
            }
          }
        }
      }
    } catch {
      // Fall through. Root package.json is still valid even if we can't parse workspaces
    }

    return rootPkg;
  }

  const searchDirs = ["apps", "packages", "src"];
  for (const subdir of searchDirs) {
    const subdirPath = join(resolvedDir, subdir);
    if (!existsSync(subdirPath)) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(subdirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = join(subdirPath, entry.name, "package.json");
        if (existsSync(pkgPath)) {
          return pkgPath;
        }
      }
    }
  }

  return null;
}

export {
  BINARY_EXTENSIONS,
  EXCLUDED_DIRS,
  MAX_AGGREGATE_BYTES,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE,
  findPackageJson,
  getRepoFiles,
  isBinaryFile,
  isExcludedDir,
  readRepoFile,
};
