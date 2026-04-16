import { tierMetaForScore } from "./score-engine/score-tiers.js";

const MARKER = "<!-- astro-score-action -->";

const STATUS_GLYPH = {
  pass: "✅ Pass",
  fail: "❌ Fail",
  na: "⚪ N/A",
  error: "⚠️ Error",
};

function buildReportUrl(owner, repo) {
  const repoUrl = `https://github.com/${owner}/${repo}`;
  return `https://useastro.com/score?repoUrl=${encodeURIComponent(repoUrl)}`;
}

function pickTopFindings(checks, count = 3) {
  const failedHigh = checks.filter((c) => c.status === "fail" && c.priority === "high");
  const failedMedium = checks.filter((c) => c.status === "fail" && c.priority === "medium");
  return [...failedHigh, ...failedMedium].slice(0, count);
}

function renderComment({ score, summary, checks, owner, repo }) {
  const tier = tierMetaForScore(score);
  const reportUrl = buildReportUrl(owner, repo);
  const topFindings = pickTopFindings(checks);

  const headline = `## Astro Score: ${score}/100`;
  const tierLine = `**${tier.label}.** ${summary}`;

  const findingsBlock = topFindings.length > 0
    ? `### Top findings\n${topFindings.map((c) => `- **${c.name}** — ${c.details}`).join("\n")}`
    : "### Top findings\nNo failing checks.";

  const tableRows = checks
    .map((c) => `| ${c.name} | ${STATUS_GLYPH[c.status] ?? c.status} |`)
    .join("\n");

  const detailsBlock = `### All checks\n<details>\n<summary>22 checks run</summary>\n\n| Check | Result |\n|-------|--------|\n${tableRows}\n</details>`;

  const footer = `[Full report →](${reportUrl}) · [What is Astro Score?](https://useastro.com/vibe-code-report/)`;

  return [headline, "", tierLine, "", findingsBlock, "", detailsBlock, "", footer, "", MARKER].join("\n");
}

async function upsertComment({ octokit, owner, repo, prNumber, body }) {
  const { data: existing } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const prior = existing.find((c) => typeof c.body === "string" && c.body.includes(MARKER));

  if (prior) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: prior.id,
      body,
    });
    return { action: "updated", commentId: prior.id };
  }

  const { data: created } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
  return { action: "created", commentId: created.id };
}

export { MARKER, buildReportUrl, pickTopFindings, renderComment, upsertComment };
