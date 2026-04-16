import { test } from "node:test";
import assert from "node:assert/strict";

import { MARKER, buildReportUrl, pickTopFindings, renderComment } from "../src/comment.js";

const FIXTURE_CHECKS = [
  { id: 1, name: "JWT in localStorage", priority: "high", status: "pass", passed: true, details: "" },
  { id: 2, name: "No environment separation / hardcoded secrets", priority: "high", status: "fail", passed: false, details: "No .env.example or environment validation found." },
  { id: 3, name: "No test files", priority: "high", status: "fail", passed: false, details: "Zero test coverage." },
  { id: 4, name: "No error boundaries", priority: "high", status: "na", passed: null, details: "No JSX components found." },
  { id: 22, name: "No timeouts on external HTTP calls", priority: "medium", status: "fail", passed: false, details: "1 of 1 files lack timeout handling." },
];

test("buildReportUrl returns a useastro.com/score URL with the encoded repo", () => {
  const url = buildReportUrl("vercel", "next.js");
  assert.equal(url, "https://useastro.com/score?repoUrl=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js");
});

test("pickTopFindings prioritizes high failures over medium", () => {
  const top = pickTopFindings(FIXTURE_CHECKS, 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].priority, "high");
  assert.equal(top[1].priority, "high");
  assert.equal(top[2].priority, "medium");
});

test("renderComment includes the score, tier label, all checks, and the upsert marker", () => {
  const body = renderComment({
    score: 62,
    summary: "Significant gaps found. These will break in production under real load.",
    checks: FIXTURE_CHECKS,
    owner: "vercel",
    repo: "next.js",
  });

  assert.match(body, /## Astro Score: 62\/100/);
  assert.match(body, /\*\*Significant Gaps\.\*\*/);
  assert.match(body, /JWT in localStorage/);
  assert.match(body, /✅ Pass/);
  assert.match(body, /❌ Fail/);
  assert.match(body, /⚪ N\/A/);
  assert.ok(body.endsWith(MARKER), "body should end with the upsert marker for find-and-update");
});

test("renderComment top findings list omits passing and N/A checks", () => {
  const body = renderComment({
    score: 62,
    summary: "Test summary.",
    checks: FIXTURE_CHECKS,
    owner: "vercel",
    repo: "next.js",
  });

  const findingsSection = body.split("### Top findings")[1].split("### All checks")[0];
  assert.ok(!findingsSection.includes("JWT in localStorage"), "passed checks should not appear in top findings");
  assert.ok(!findingsSection.includes("No error boundaries"), "N/A checks should not appear in top findings");
  assert.ok(findingsSection.includes("No environment separation"), "high-priority failures should appear");
});
