// Ported verbatim from Astro-Website/services/score-api/src/checks/medium-priority.js.
// The source file also exports checkNoReusableComponents and checkNoUiDesignSystem
// which are not registered in the 22-check rubric. They are kept here so a diff
// against the source stays clean during the byte-identical-port phase.

export function checkNoCiCd(ctx) {
  const ciFiles = [
    ".github/workflows/**",
    ".gitlab-ci.yml",
    ".circleci/**",
    "Jenkinsfile",
    "bitbucket-pipelines.yml",
    "azure-pipelines.yml",
    ".travis.yml",
  ];

  for (const pattern of ciFiles) {
    if (ctx.findFiles(pattern).length > 0) {
      return { passed: true, details: "CI/CD configuration found." };
    }
  }

  const deployConfigs = ["vercel.json", "netlify.toml", "fly.toml", "railway.json", "render.yaml", "Dockerfile"];
  for (const file of deployConfigs) {
    if (ctx.hasFile(file)) {
      return { passed: true, details: `Deploy configuration found (${file}).` };
    }
  }

  const srcFileCount = ctx.files.filter((f) => /\.[jt]sx?$/.test(f.relativePath)).length;
  return {
    passed: false,
    details: `No CI/CD configuration found (checked GitHub Actions, GitLab CI, Dockerfile, Vercel/Netlify/Fly configs). ${srcFileCount} source files deployed manually.`,
  };
}

export function checkNoReusableComponents(ctx) {
  const reuseDirs = ["components", "hooks", "utils", "lib", "shared", "common", "helpers"];
  let totalReuseFiles = 0;

  for (const dir of reuseDirs) {
    const files = ctx.findFiles(`${dir}/**`).concat(ctx.findFiles(`src/${dir}/**`));
    totalReuseFiles += files.length;
  }

  if (totalReuseFiles >= 3) {
    return { passed: true, details: `${totalReuseFiles} files found in reusable directories.` };
  }

  const srcFiles = ctx.files.filter((f) => /\.[jt]sx?$/.test(f.relativePath) && ctx.isSourceFile(f.relativePath));
  if (srcFiles.length < 5) {
    return { passed: true, notApplicable: true, details: "Small project." };
  }

  return {
    passed: false,
    details: "Copy-paste code everywhere. One fix = 12 files to update. Maintenance nightmare at scale.",
  };
}

export function checkNoUiDesignSystem(ctx) {
  const designSystemDeps = [
    "@radix-ui", "@headlessui", "@chakra-ui", "@mui/material", "@mantine/core",
    "antd", "shadcn", "@shadcn/ui", "styled-components", "@emotion/react",
    "tailwindcss", "@tailwindcss/postcss",
  ];

  if (ctx.hasAnyDep(designSystemDeps)) {
    return { passed: true, details: "UI framework or design system found in dependencies." };
  }

  const tailwindConfig = ctx.hasFile("tailwind.config.*") || ctx.hasFile("tailwind.config.ts") || ctx.hasFile("tailwind.config.js");
  if (tailwindConfig) {
    return { passed: true, details: "Tailwind CSS configuration found." };
  }

  const inlineStyleFiles = ctx.grepSourceFiles(/style\s*=\s*\{\s*\{/).length;
  if (inlineStyleFiles > 10) {
    return {
      passed: false,
      details: "Inconsistent UI. Looks amateur. Erodes user trust. Impossible to maintain visual coherence.",
    };
  }

  const componentFiles = ctx.files.filter((f) => /\.[jt]sx$/.test(f.relativePath));
  if (componentFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No JSX components found." };
  }

  return {
    passed: false,
    details: "Inconsistent UI. Looks amateur. Erodes user trust. Impossible to maintain visual coherence.",
  };
}

export function checkMissingLockfile(ctx) {
  const lockfiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"];

  for (const lockfile of lockfiles) {
    if (ctx.hasFile(lockfile)) {
      return { passed: true, details: `Lockfile found: ${lockfile}` };
    }
  }

  return {
    passed: false,
    details: "\"Worked yesterday\" deploy failures. Different deps every install.",
  };
}

export function checkMissingDbIndexes(ctx) {
  const prismaSchemaFiles = ctx.findFiles("**/schema.prisma");
  if (prismaSchemaFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No Prisma schema found." };
  }

  const schemaContent = prismaSchemaFiles.map((f) => f.content).join("\n");
  const hotFields = ["userId", "tenantId", "orgId", "status", "createdAt", "email"];
  const usedHotFields = hotFields.filter((field) => schemaContent.includes(field));

  if (usedHotFields.length === 0) {
    return { passed: true, details: "No frequently-filtered fields detected in schema." };
  }

  const indexMatches = schemaContent.match(/@@index\(\[([^\]]+)\]/g) ?? [];
  const uniqueMatches = schemaContent.match(/@@unique\(\[([^\]]+)\]/g) ?? [];
  const indexedFields = [...indexMatches, ...uniqueMatches].join(" ");

  const fieldLines = schemaContent.split("\n");
  const inlineIndexedFields = new Set();
  for (const line of fieldLines) {
    const fieldMatch = line.match(/^\s+(\w+)\s+\w+.*(?:@id|@unique)/);
    if (fieldMatch) {
      inlineIndexedFields.add(fieldMatch[1]);
    }
  }

  const unindexedHotFields = usedHotFields.filter(
    (field) => !indexedFields.includes(field) && !inlineIndexedFields.has(field),
  );

  if (unindexedHotFields.length === 0) {
    return { passed: true, details: "Index annotations cover hot filter fields in Prisma schema." };
  }

  return {
    passed: false,
    details: `Fields ${unindexedHotFields.join(", ")} are used but not indexed. App feels fine at 100 rows. Falls over at 100K.`,
  };
}

export function checkNoTimeoutsOnExternalCalls(ctx) {
  const serverFiles = ctx.files.filter(
    (f) => ctx.isSourceFile(f.relativePath)
      && !/\.[jt]sx$/.test(f.relativePath)
      && !/\.sh$/.test(f.relativePath)
      && !/\.mjs$/.test(f.relativePath)
      && !/setup.*\.js$/.test(f.relativePath),
  );

  const fetchFiles = serverFiles.filter((f) =>
    /\bfetch\s*\(/.test(f.content)
    || /\baxios[\s.]/.test(f.content)
    || /\bgot\s*\(/.test(f.content)
    || /\bofetch\s*\(|\b\$fetch\s*\(/.test(f.content)
    || /\bHttpService\b|\bhttpService\b/.test(f.content),
  );

  if (fetchFiles.length === 0) {
    return { passed: true, notApplicable: true, details: "No external HTTP calls detected in server code." };
  }

  const timeoutPatterns = /AbortController|signal\s*:|timeout\s*[=:]|\.timeout\s*\(|AbortSignal\.timeout|\.pipe\s*\(\s*timeout\s*\(|defaults\.timeout|requestTimeout|connectTimeout/;
  const noTimeout = fetchFiles.filter(
    (f) => !timeoutPatterns.test(f.content),
  );

  if (noTimeout.length === 0) {
    return { passed: true, details: "Timeout/abort signals found on external HTTP calls." };
  }

  const fileNames = noTimeout.slice(0, 3).map((f) => f.relativePath.split("/").pop()).join(", ");
  return {
    passed: false,
    details: `${noTimeout.length} of ${fetchFiles.length} files with external HTTP calls lack timeout/abort handling (${fileNames}${noTimeout.length > 3 ? ", ..." : ""}).`,
  };
}
