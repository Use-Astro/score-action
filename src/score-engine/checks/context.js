// Ported verbatim from Astro-Website/services/score-api/src/checks/context.js.
// The only behavioral change is the import path for the file walker — the
// Action's stripped repo.js sits at ../repo.js relative to this file, the
// same relative path as in the source. Framework detectors, glob matcher,
// JS/TS gating logic, and helper signatures are identical to the source.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getRepoFiles, findPackageJson, readRepoFile } from "../repo.js";

const SOURCE_EXCLUDE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.stories\.[jt]sx?$/,
  /\.story\.[jt]sx?$/,
  /__tests__\//,
  /__mocks__\//,
  /^tests?\//,
  /\/tests?\//,
  /fixtures?\//,
  /examples?\//,
  /samples?\//,
  /demos?\//,
  /^docs?\//,
  /\/docs?\//,
  /generated\//,
  /prisma\/client\//,
  /\.next\//,
  /dist\//,
  /migrations?\//,
  /db\/migrate\//,
  /stories\//,
  /storybook\//,
  /\.storybook\//,
  /\.mdx?$/,
  /\.ya?ml$/,
  /\.json$/,
  /\.lock$/,
  /\.config\.[jt]s$/,
  /\.setup\.[jt]s$/,
  /\.diff$/,
  /\.patch$/,
  /\.mdc$/,
  /\.html$/,
  /\.css$/,
  /\.svg$/,
  /sw\.[jt]s$/,
  /service[-_]?worker\.[jt]s$/,
  /\.d\.ts$/,
];

const FRAMEWORK_DETECTORS = [
  { dep: "@nestjs/core", framework: "nestjs" },
  { dep: "@adonisjs/core", framework: "adonisjs" },
  { dep: "hono", framework: "hono" },
  { dep: "elysia", framework: "elysia" },
  { dep: "next", framework: "nextjs" },
  { dep: "@remix-run/node", framework: "remix" },
  { dep: "@remix-run/react", framework: "remix" },
  { dep: "react-router", framework: "react-router" },
  { dep: "astro", framework: "astro" },
  { dep: "nuxt", framework: "nuxt" },
  { dep: "@sveltejs/kit", framework: "sveltekit" },
  { dep: "@solidjs/start", framework: "solidstart" },
  { dep: "@builder.io/qwik-city", framework: "qwik" },
  { dep: "@analogjs/platform", framework: "analog" },
  { dep: "@tanstack/react-start", framework: "tanstack-start" },
  { dep: "convex", framework: "convex" },
  { dep: "expo", framework: "expo" },
  { dep: "expo-router", framework: "expo" },
  { dep: "fastify", framework: "fastify" },
  { dep: "express", framework: "express" },
  { dep: "koa", framework: "koa" },
  { dep: "hapi", framework: "hapi" },
];

function detectFramework(packageJson) {
  if (!packageJson) {
    return "unknown";
  }

  const allDeps = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  };

  for (const { dep, framework } of FRAMEWORK_DETECTORS) {
    if (dep in allDeps) {
      return framework;
    }
  }

  return "unknown";
}

function getDeps(packageJson) {
  if (!packageJson) {
    return { deps: {}, devDeps: {}, allDeps: {} };
  }

  const deps = packageJson.dependencies ?? {};
  const devDeps = packageJson.devDependencies ?? {};
  const allDeps = { ...deps, ...devDeps };

  return { deps, devDeps, allDeps };
}

function isSourceFile(relativePath) {
  return !SOURCE_EXCLUDE_PATTERNS.some((pattern) => pattern.test(relativePath));
}

function makeGlobMatcher(globPattern) {
  const escaped = globPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "{{GLOBSTARSLASH}}")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTARSLASH\}\}/g, "(?:.*/)?")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");

  return new RegExp(`^${escaped}$`);
}

async function buildRepoContext(extractDir) {
  const rawFiles = getRepoFiles(extractDir);
  const pkgPath = findPackageJson(extractDir);

  let packageJson = null;
  if (pkgPath) {
    try {
      packageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    } catch {
      packageJson = null;
    }
  }

  const files = rawFiles.map((f) => ({
    relativePath: f.relativePath,
    absPath: f.absPath,
    content: readRepoFile(f.absPath),
  }));

  const allPkgFiles = files.filter((f) => f.relativePath.endsWith("package.json") && !f.relativePath.includes("node_modules"));
  const aggregatedDeps = {};
  const aggregatedDevDeps = {};
  for (const f of allPkgFiles) {
    try {
      const pkg = JSON.parse(f.content);
      Object.assign(aggregatedDeps, pkg.dependencies ?? {});
      Object.assign(aggregatedDevDeps, pkg.devDependencies ?? {});
    } catch {
      // skip malformed package.json
    }
  }
  const aggregatedAllDeps = { ...aggregatedDeps, ...aggregatedDevDeps };

  const codeFiles = files.filter(
    (f) => isSourceFile(f.relativePath) && /\.(?:[jt]sx?|mjs|cjs|mts|cts)$/.test(f.relativePath),
  );
  const nonCodeFiles = files.filter(
    (f) => isSourceFile(f.relativePath) && /\.(?:rs|py|go|rb|java|kt|swift|php|cs|cpp|c|h|hpp|scala|clj|ex|exs|erl|lua|dart|ml|hs|nim|zig|v|sol)$/.test(f.relativePath),
  );
  const jsTsFileCount = codeFiles.length;
  const otherLangFileCount = nonCodeFiles.length;

  const LANG_BY_EXT = {
    rs: "Rust", py: "Python", go: "Go", rb: "Ruby", java: "Java",
    kt: "Kotlin", swift: "Swift", php: "PHP", cs: "C#",
    cpp: "C++", c: "C", h: "C/C++", hpp: "C++",
    scala: "Scala", clj: "Clojure", ex: "Elixir", exs: "Elixir",
    erl: "Erlang", lua: "Lua", dart: "Dart", ml: "OCaml",
    hs: "Haskell", nim: "Nim", zig: "Zig", v: "V", sol: "Solidity",
  };
  const langCounts = {};
  for (const f of nonCodeFiles) {
    const ext = f.relativePath.split(".").pop()?.toLowerCase() ?? "";
    const lang = LANG_BY_EXT[ext];
    if (lang) langCounts[lang] = (langCounts[lang] ?? 0) + 1;
  }
  let detectedLanguage = null;
  let detectedLanguageCount = 0;
  for (const [lang, count] of Object.entries(langCounts)) {
    if (count > detectedLanguageCount) {
      detectedLanguage = lang;
      detectedLanguageCount = count;
    }
  }

  const hasMinJsTs = jsTsFileCount >= 3;
  const jsTsDominant = otherLangFileCount === 0 || jsTsFileCount > otherLangFileCount;
  const isJsTs = hasMinJsTs && jsTsDominant;
  const primaryFramework = detectFramework(packageJson);
  const framework = primaryFramework !== "unknown" ? primaryFramework : detectFramework({ dependencies: aggregatedDeps, devDependencies: aggregatedDevDeps });
  const { deps, devDeps, allDeps } = getDeps(packageJson);
  Object.assign(allDeps, aggregatedAllDeps);

  const repoName = packageJson?.name ?? basename(extractDir);

  function hasFile(globPattern) {
    if (!/[*?]/.test(globPattern)) {
      return existsSync(join(extractDir, globPattern));
    }

    const matcher = makeGlobMatcher(globPattern);
    return files.some((f) => matcher.test(f.relativePath));
  }

  function findFiles(globPattern) {
    const matcher = makeGlobMatcher(globPattern);
    return files.filter((f) => matcher.test(f.relativePath));
  }

  function grepFiles(pattern) {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
    return files.filter((f) => regex.test(f.content));
  }

  function grepSourceFiles(pattern) {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
    return files.filter((f) => isSourceFile(f.relativePath) && regex.test(f.content));
  }

  function hasDep(name) {
    return name in allDeps;
  }

  function hasAnyDep(names) {
    return names.some((name) => name in allDeps);
  }

  return {
    files,
    packageJson,
    deps,
    devDeps,
    allDeps,
    framework,
    repoName,
    isJsTs,
    jsTsFileCount,
    otherLangFileCount,
    detectedLanguage,
    hasFile,
    findFiles,
    grepFiles,
    grepSourceFiles,
    hasDep,
    hasAnyDep,
    isSourceFile,
  };
}

export {
  buildRepoContext,
  detectFramework,
  getDeps,
  isSourceFile,
  makeGlobMatcher,
};
