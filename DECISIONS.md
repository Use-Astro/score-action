---
id: SCO-rWmlvVjelw
---

# Decisions

Running log of architectural and scope decisions made while building `use-astro/score-action`. Each entry documents the choice, the alternatives considered, and the reasoning, so future work can revisit with full context.

---

## 2026-04-16: Ship Model A for v1.0, layer Model C insights in v1.1

The brief asked the agent to evaluate three models for what the Action should compute:
- **Model A:** identical to the 22-check web Score
- **Model B:** 22 baseline + extra CI-only checks that count toward the score
- **Model C:** 22 baseline scored identically + extra CI-only checks shown as bonus context

**Decision: Model A for the Sunday Apr 19 ship. Model C planned for v1.1.**

Reasoning:

1. **Same headline number everywhere.** The Vibe Code Report (`useastro.com/vibe-code-report/`) and the homepage banner cite a single 22-check rubric with concrete failure-mode percentages. If the Action produces a different score for the same repo, the brand fragments and the Report's claims become contestable. Models B and C both protect the score, but Model A is the simplest path to that consistency.

2. **The engine ports cleanly.** All 22 checks in `services/score-api/src/checks/` are pure functions of a `ctx` object built from the local filesystem. Zero external services, no git history, no execution. The port is a copy of five files plus a stripped-down file walker. That leaves time for testing, Marketplace listing prep, a real-world install, and recovery from surprises.

3. **The execution-based extensions Bernardo listed are real value but heterogeneous.** `tsc --noEmit` and `npm audit` are cheap and high-signal. Test execution, bundle analysis, and Lighthouse all need repo-specific configuration we cannot reliably auto-detect. Shipping them piecemeal in v1.1 as a clearly-labeled "CI insights" section beats jamming a half-built Model B into v1.0.

4. **The brief explicitly green-lit this fallback:** "If you can ship Model B by Sunday, ship Model B. If it pushes past Sunday, fall back to Model A." Model B/C as currently scoped pushes past Sunday once you account for testing the additional check paths.

**v1.1 scope (post-Monday):** Add a collapsible "CI insights" section to the PR comment with `tsc --noEmit` summary and `npm audit` summary. Both run only when the relevant config exists in the repo. Neither affects the 0-100 Score.

---

## 2026-04-16: No backend POST in v1.0; deterministic report URL

The brief specifies the Action should POST results to a backend so that `/score/report/[slug]/` URLs exist. As of today, per-slug report pages are not built (the website agent's `FindYourRepoSection.tsx` routes to `/score?repoUrl=...` instead) and no backend ingest endpoint for Action submissions has been specced.

**Decision: v1.0 ships self-contained.** The PR comment's "Full report" link and the Action's `report-url` output point at:

```
https://useastro.com/score?repoUrl=https://github.com/{owner}/{repo}
```

This routes the user to the live web scanner, which will produce a fresh interactive report. It is the same destination the Vibe Code Report's "Find your repo" form uses, so behavior is consistent across surfaces.

**v1.1 (post-Monday):** When the website agent ships per-slug pages and a backend ingest endpoint, swap the report URL to the real `/score/report/[slug]/` form and POST results on each Action run. The endpoint contract proposal lives below in the "Endpoint contracts" section so the website agent can implement against it.

---

## 2026-04-16: Email capture deferred to v1.1

The brief proposed Path A (CTA in the PR comment linking to `useastro.com/action/claim/[token]`) for first-install email capture. That endpoint does not exist yet, and adding a "claim your install" line to the PR comment without a working destination would be visibly broken.

**Decision: v1.0 ships without email capture.** The PR comment ends with links to the Vibe Code Report and the live scanner. v1.1 wires the claim flow once `useastro.com/action/claim/[token]` is live on the website backend.

---

## 2026-04-16: Bundling: `@vercel/ncc` to `dist/index.js`

GitHub Actions Node runners can resolve a committed `node_modules`, but the de facto standard for distributed Actions is to bundle the entrypoint into a single file (typically with `@vercel/ncc`) and commit only `dist/`. This keeps the repo small, makes the runtime deterministic, and matches what the GitHub Marketplace expects.

**Decision: build with ncc to `dist/index.js`. `action.yml` references `dist/index.js`.** Runtime deps are listed in `package.json` for development and review, but only `dist/` ships at runtime.

---

## 2026-04-16: Language: ES module JavaScript, not TypeScript

The brief preferred TypeScript. The score-api engine code is JavaScript (ESM, Node 20+). Translating the engine to TS adds zero functional value, doubles the maintenance surface for the months we run two copies, and risks introducing translation bugs.

**Decision: keep the Action in plain ESM JavaScript so the engine port is byte-identical to the source.** When a shared `@use-astro/score-engine` package ships and removes the duplication, we can revisit TypeScript.

---

## 2026-04-16: Engine duplication strategy: copy now, extract later

The brief offered two paths for the engine: extract into a shared package (`packages/score-engine` workspace or separate `use-astro/score-engine` repo) versus copy the checks directly into the Action and track drift manually.

**Decision: copy the checks directly for v1.0.** The score-api engine has no entanglement with website-specific code beyond the file paths it imports. The relevant files (`checks/index.js`, `checks/context.js`, `checks/high-priority.js`, `checks/medium-priority.js`, `score-tiers.js`, plus the file-walker portion of `repo.js`) copy verbatim into `src/score-engine/`. A header comment in each ported file points to the canonical source so drift is obvious in code review.

Extracting to a shared package is the right long-term answer and should happen in the week after launch. It is not the right v1.0 work.

---

## Endpoint contracts (proposed for the website agent)

These are the contracts the Action will consume in v1.1 once the website ships them. Documenting them here so the website agent can pick them up from the website plan at `/Users/nishikawa/Development/Astro/Astro-Website/docs/website-plan-vibe-code-report-apr-2026.md` if the formats align, or so we can adjust if they have already specced something different.

If the website agent has already shipped a different shape, the Action will align with theirs, not the proposal here.

### Report URL: `/score/report/[slug]/`

- `slug` is a 21-character nanoid (matches `REPORT_ID_REGEX` in `services/score-api/src/validation.js`)
- For Action submissions, the slug should be deterministic: `sha256(owner + "/" + repo + ":action").slice(0, 21)` so the same repo always lands on the same report URL across PRs
- Page renders the latest scored result for that slug, plus a history of recent scans

### Action ingest: `POST useastro.com/api/v1/action/score`

Request body:
```json
{
  "owner": "string",
  "repo": "string",
  "ref": "string (commit SHA)",
  "prNumber": "number | null",
  "score": "number (0-100)",
  "checks": "Check[]",
  "framework": "string",
  "fileCount": "number",
  "scanDurationMs": "number"
}
```

Response:
```json
{ "slug": "string (21-char nanoid)", "reportUrl": "string" }
```

Auth: signed by an `ASTRO_INGEST_TOKEN` env var that the Action will accept as input (default reads from `secrets.ASTRO_INGEST_TOKEN` if present, falls back to anonymous submission).

### Email capture: `GET useastro.com/action/claim/[token]`

The Action embeds a per-install token in the PR comment. The page accepts an email, links the token to the install, and adds the email to the waitlist.

### Badge SVG: `GET useastro.com/score/badge/[slug].svg`

Returns a Shields.io-style SVG colored by tier (red < 36, orange 36-65, yellow 66-85, green 86-100). The Action's `post-badge: true` input writes a markdown badge line referencing this URL.
