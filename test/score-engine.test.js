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

const indexedUser = `model User {
  id String @id
  email String @unique
}`;
const unindexedContact = `model Contact {
  id String @id
  email String
  tenantId String
}`;

test("multi-file Prisma schema detects missing indexes and tenant leakage", async () => {
  const dir = makeFixtureRepo({
    "prisma/schema/users.prisma": indexedUser,
    "domains/contacts/contacts.prisma": unindexedContact,
    "src/contacts.ts": "prisma.contact.findMany({ where: { email } });",
  });

  try {
    const result = runAllChecks(await buildRepoContext(dir));
    const indexes = result.checks.find((c) => c.id === 21);
    assert.equal(indexes.status, "fail");
    assert.match(indexes.details, /Contact\.email/);
    assert.match(indexes.details, /Contact\.tenantId/);
    assert.doesNotMatch(indexes.details, /User\.email/);
    assert.equal(result.checks.find((c) => c.id === 10).status, "fail");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("110 KB Prisma schema is fully checked past the file size limit", async () => {
  const schema = `// ${"x".repeat(110 * 1024 - unindexedContact.length - 4)}\n${unindexedContact}`;
  assert.equal(Buffer.byteLength(schema), 110 * 1024);
  const dir = makeFixtureRepo({ "prisma/schema.prisma": schema });

  try {
    const ctx = await buildRepoContext(dir);
    assert.equal(runAllChecks(ctx).checks.find((c) => c.id === 21).status, "fail");
    assert.equal(ctx.findFiles("**/*.prisma")[0].content, schema);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concatenated Prisma schema and source files report each missing index once", async () => {
  const contact = unindexedContact.replace("  tenantId String\n", "");
  const dir = makeFixtureRepo({
    "prisma/schema.prisma": `${indexedUser}\n${contact}`,
    "prisma/schema/users.prisma": indexedUser,
    "prisma/schema/contacts.prisma": contact,
  });

  try {
    const ctx = await buildRepoContext(dir);
    const indexes = runAllChecks(ctx).checks.find((c) => c.id === 21);
    assert.equal(indexes.status, "fail");
    assert.equal((indexes.details.match(/Contact\.email/g) ?? []).length, 1);
    const sourcesOnly = runAllChecks({
      ...ctx,
      findFiles: (pattern) => ctx.findFiles(pattern).filter((f) => f.relativePath !== "prisma/schema.prisma"),
    });
    assert.deepEqual(indexes, sourcesOnly.checks.find((c) => c.id === 21));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Prisma scan preserves exclusions and recognizes model-local index annotations", async () => {
  const dir = makeFixtureRepo({
    "models.prisma": `// model Ignored { email String }
model Session {
  id String
  tenantId String
  userId String
  status String
  createdAt DateTime
  email String @unique
  metadata String @default("{https://example.com}")
  @@id([tenantId, id])
  @@index([userId, status, createdAt])
}`,
    "node_modules/ignored/schema.prisma": unindexedContact,
    "dist/schema.prisma": unindexedContact,
    "build/schema.prisma": unindexedContact,
    "src/large.ts": "x".repeat(110 * 1024),
  });

  try {
    const ctx = await buildRepoContext(dir);
    assert.deepEqual(ctx.findFiles("**/*.prisma").map((f) => f.relativePath), ["models.prisma"]);
    assert.equal(ctx.findFiles("**/*.ts").length, 0);
    assert.equal(runAllChecks(ctx).checks.find((c) => c.id === 21).status, "pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
