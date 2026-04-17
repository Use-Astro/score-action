import * as core from "@actions/core";
import * as github from "@actions/github";

import { buildRepoContext } from "./score-engine/checks/context.js";
import { runAllChecks } from "./score-engine/checks/index.js";
import { buildReportUrl, renderComment, upsertComment } from "./comment.js";

function readBoolInput(name, defaultValue) {
  const raw = core.getInput(name);
  if (raw === "" || raw === undefined) return defaultValue;
  return raw.toLowerCase() === "true";
}

function readIntInput(name, defaultValue) {
  const raw = core.getInput(name);
  if (raw === "" || raw === undefined) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function run() {
  const token = core.getInput("github-token");
  const failBelow = readIntInput("fail-on-score-below", 0);
  const commentOnPr = readBoolInput("comment-on-pr", true);

  const ctx = github.context;
  const { owner, repo } = ctx.repo;
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();

  core.info(`Astro Score scanning ${owner}/${repo} at ${workspace}`);

  const repoContext = await buildRepoContext(workspace);

  if (!repoContext.isJsTs) {
    const reason = repoContext.detectedLanguage
      ? `dominant language detected: ${repoContext.detectedLanguage}`
      : "no JS/TS source files found";
    core.warning(`Skipping Astro Score. ${reason}. Astro Score currently only scans JS/TS repos.`);
    core.setOutput("score", "");
    core.setOutput("report-url", "");
    return;
  }

  const startedAt = Date.now();
  const { checks, overallScore, summary } = runAllChecks(repoContext);
  const scanDurationMs = Date.now() - startedAt;

  core.info(`Astro Score: ${overallScore}/100 (${checks.filter((c) => c.status === "pass").length} pass, ${checks.filter((c) => c.status === "fail").length} fail, ${checks.filter((c) => c.status === "na").length} N/A) in ${scanDurationMs}ms`);

  const reportUrl = buildReportUrl(owner, repo);
  core.setOutput("score", String(overallScore));
  core.setOutput("report-url", reportUrl);

  const prNumber = ctx.payload.pull_request?.number ?? ctx.payload.issue?.number ?? null;
  if (commentOnPr && prNumber && token) {
    try {
      const octokit = github.getOctokit(token);
      const body = renderComment({ score: overallScore, summary, checks, owner, repo });
      const result = await upsertComment({ octokit, owner, repo, prNumber, body });
      core.info(`PR comment ${result.action} (id ${result.commentId})`);
    } catch (error) {
      core.warning(`Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (commentOnPr && !prNumber) {
    core.info("No PR context detected, skipping PR comment.");
  }

  if (failBelow > 0 && overallScore < failBelow) {
    core.setFailed(`Astro Score ${overallScore} is below the configured threshold ${failBelow}.`);
  }
}

run().catch((error) => {
  core.setFailed(`Astro Score action failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});
