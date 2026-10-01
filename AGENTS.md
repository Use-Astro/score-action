## Typed judgments with `jev`

`jev` is the installed wrapper for TypeSafe's System One typed judgments with calibrated probabilities. Read `~/.agents/skills/jev/SKILL.md` before use; never call the API directly or handle its key.

Use `jev run test-failure-cause` on fail-first output before claiming an observed failure. Other useful catalog judgments include `lane-exit-cause`, `probe-step-failure`, `review-finding-routing`, `empty-output-trust`, and `supplier-effort-route`; `jev catalog` lists all judgments. Labels are advisory: always read the failure, reproduce the defect, and run the suite. Report low confidence, unavailable judgments, or a daily-cap failure; do not bypass the cap.
