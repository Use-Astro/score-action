---
id: SCO-QzPQi5eRBA
---

# Astro Score GitHub Action

Production readiness checks on every pull request. 22 checks, a 0-100 Score, posted as a PR comment.

Astro Score is the same diagnostic that powers the [Vibe Code Report](https://useastro.com/vibe-code-report/) and [useastro.com/score](https://useastro.com/score). The Action runs the same 22 checks against your repo on every PR and posts the results as a comment, so you see what would break in production before it ships.

## Quickstart

Add `.github/workflows/score.yml` to your repo:

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

That is the whole install. The Action will check out your repo, run the 22 checks, and post a comment on the PR with the Score and the failing checks.

## Inputs

| Name | Default | Description |
|------|---------|-------------|
| `github-token` | `${{ github.token }}` | Token used to post the PR comment. The default workflow token works for public repos. |
| `fail-on-score-below` | `0` | Fail the workflow if the Score is below this number. `0` disables the gate. |
| `comment-on-pr` | `true` | Post the Score as a PR comment. Set to `false` if you want outputs only. |
| `post-badge` | `false` | Reserved for v1.1. No effect today. |
| `api-endpoint` | `https://useastro.com` | Reserved for v1.1 backend submission. Unused today. |

## Outputs

| Name | Description |
|------|-------------|
| `score` | The overall Score (0-100). Empty string if the repo is not a JS/TS project. |
| `report-url` | A shareable URL to the full report for this repo. |

## Examples

### Fail the build on a low Score

```yaml
- uses: useastro/score-action@v1
  with:
    fail-on-score-below: 60
```

The Action exits non-zero if the Score is below 60. Use this once you know your repo's typical Score and want to prevent regressions.

### Outputs only (no PR comment)

```yaml
- id: score
  uses: useastro/score-action@v1
  with:
    comment-on-pr: false

- name: Print the Score
  run: echo "Astro Score is ${{ steps.score.outputs.score }} — see ${{ steps.score.outputs.report-url }}"
```

### Run on push to main as well

```yaml
on:
  pull_request:
  push:
    branches: [main]

jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: useastro/score-action@v1
```

Push runs do not post a PR comment (there is no PR), but they still set the `score` and `report-url` outputs.

## What the 22 checks cover

The same rubric as the public scanner:

- Error boundaries, logging, observability
- API auth, input validation, rate limiting
- Timeout protection on external calls
- Database transactions, migrations, query safety
- Environment separation, secret handling, .env hygiene
- CI/CD config, lockfile, hot-field indexes
- Cookie and session flag safety
- Open CORS on authenticated APIs
- Client/server boundary violations
- Cross-tenant query leakage
- Webhook signature verification
- Unrestricted file uploads
- JWT in localStorage

The full list and methodology lives at [useastro.com/vibe-code-report/#methodology](https://useastro.com/vibe-code-report/#methodology).

## Supported projects

JavaScript and TypeScript repos. The Action detects the framework (Next.js, Remix, SvelteKit, Nuxt, Astro, Express, Hono, Fastify, NestJS, and more) and adjusts the relevant checks.

Repos that are not JS/TS get skipped with a warning, no PR comment.

## License

MIT. See [LICENSE](./LICENSE).

## Related

- [useastro.com/score](https://useastro.com/score) — paste any GitHub URL, get the same Score in your browser.
- [The Vibe Code Report](https://useastro.com/vibe-code-report/) — what we learned scanning 100,000 AI-generated repos.
