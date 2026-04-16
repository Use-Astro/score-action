---
id: SCO-gYaRGlkiRe
---

# GitHub Marketplace listing — copy-paste reference

Use these values when publishing the Action to the GitHub Marketplace. Pre-filled from the brief and the v1 README so the published listing stays consistent.

## Listing metadata

| Field | Value |
|-------|-------|
| **Display name** | Astro Score |
| **Tagline** | Production readiness checks on every pull request |
| **Primary category** | Code quality |
| **Secondary category** | Security |
| **Icon** | check-circle (already set in `action.yml` `branding`) |
| **Color** | blue (already set in `action.yml` `branding`) |

The tagline is 51 characters, comfortably under the GitHub 64-character limit.

## Long description (paste into the Marketplace description field)

> Astro Score is the same diagnostic that powers the Vibe Code Report and useastro.com/score. Install it on any repo and the Action runs 22 production readiness checks against your codebase on every pull request, then posts a comment with a 0-100 Score and the top failing checks.
>
> The checks cover the things AI-generated code most often skips: error boundaries, logging, API auth, input validation, rate limiting, timeout protection, database transactions and migrations, environment separation, CI/CD config, and more. Static analysis only. No code execution. No data leaves the runner.
>
> Same rubric as the public scanner at useastro.com/score, so the headline number on a PR matches the headline number on the web. Free.

## Pre-publish checklist

Run through this before clicking publish.

1. `useastro/score-action` repo exists on GitHub, public, with `main` as the default branch.
2. The repo on GitHub matches the local `score-action/` working tree (push `main`).
3. CI workflow `.github/workflows/test.yml` is green on `main`.
4. `dist/index.js` is committed and current (`npm run build` produces no diff).
5. README renders correctly on github.com (especially the YAML snippet block).
6. LICENSE present and shows MIT in the GitHub repo header.
7. Tag `v1.0.0` created on the `main` HEAD: `git tag -a v1.0.0 -m "v1.0.0" && git push origin v1.0.0`.
8. The `Release` workflow runs on the tag push, creates the GitHub release, and force-pushes the `v1` major-version tag. Verify on the Releases page.
9. On the repo page, click "Draft a release" or "Publish this Action to the GitHub Marketplace" depending on what GitHub surfaces. Accept the Marketplace developer agreement.
10. Fill in the Marketplace fields above, attach a logo if requested, submit for review.

GitHub typically reviews Marketplace listings within a few hours. The Action remains usable via `useastro/score-action@v1` regardless of Marketplace approval — the listing is for discovery, not for distribution.

## Post-publish smoke test

Before announcing, open one test PR on a real public repo (e.g., a sandbox under your own account) using:

```yaml
name: Astro Score
on: [pull_request]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: useastro/score-action@v1
```

Confirm:
- The Action runs to completion.
- A comment posts on the PR with the Astro Score, top findings, and the collapsed 22-check table.
- A second push to the same PR updates the existing comment instead of creating a new one (upsert by `<!-- astro-score-action -->` marker).
- The "Full report" link in the comment navigates to `useastro.com/score?repoUrl=...` and produces a valid scan.
- The Action's `score` and `report-url` outputs are populated (visible in the Action run summary).
