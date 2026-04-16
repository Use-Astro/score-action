import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRepoContext } from "../src/score-engine/checks/context.js";
import { runAllChecks, CHECK_DEFINITIONS } from "../src/score-engine/checks/index.js";
import { tierMetaForScore } from "../src/score-engine/score-tiers.js";

function makeFixtureRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "score-action-fixture-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

test("CHECK_DEFINITIONS still has exactly 22 checks (lockstep with web scanner)", () => {
  assert.equal(CHECK_DEFINITIONS.length, 22);
});

test("runAllChecks returns a 0-100 score and tier label for a minimal Next.js repo", async () => {
  const dir = makeFixtureRepo({
    "package.json": JSON.stringify({
      name: "fixture-next",
      dependencies: { next: "^14.0.0", react: "^18.0.0", "react-dom": "^18.0.0" },
      devDependencies: { typescript: "^5.0.0" },
      scripts: { test: "vitest" },
    }),
    "package-lock.json": "{}",
    ".env.example": "DATABASE_URL=",
    ".gitignore": ".env\nnode_modules\n",
    "app/page.tsx": "export default function Page() { return <div>Hello</div>; }",
    "app/api/route.ts": "export async function GET() { return new Response('ok'); }",
    "lib/util.ts": "export function add(a: number, b: number) { return a + b; }",
  });

  try {
    const ctx = await buildRepoContext(dir);
    assert.equal(ctx.isJsTs, true);
    assert.equal(ctx.framework, "nextjs");

    const result = runAllChecks(ctx);
    assert.equal(typeof result.overallScore, "number");
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100, "score is 0-100");
    assert.ok(["small", "medium", "large", "enterprise"].includes(result.complexityTier));

    const tier = tierMetaForScore(result.overallScore);
    assert.ok(tier, "tier is resolved");
    assert.equal(result.checks.length, 22);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runAllChecks rejects a Rust repo as not JS/TS", async () => {
  const dir = makeFixtureRepo({
    "Cargo.toml": "[package]\nname = \"fixture\"\n",
    "src/main.rs": "fn main() {}",
    "src/lib.rs": "pub fn hi() {}",
    "src/util.rs": "pub fn util() {}",
  });

  try {
    const ctx = await buildRepoContext(dir);
    assert.equal(ctx.isJsTs, false);
    assert.equal(ctx.detectedLanguage, "Rust");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
