// Ported verbatim from Astro-Website/services/score-api/src/score-tiers.js.
// Keep this file byte-identical to the source so the Action and the web
// scanner produce the same tier label for the same score. If you change
// thresholds or summaries here, change them in the source first.

const TIER_THRESHOLDS = Object.freeze({
  CRITICAL_MAX: 35,
  SIGNIFICANT_GAPS_MAX: 65,
  GETTING_CLOSE_MAX: 85,
});

const TIERS = Object.freeze([
  Object.freeze({ id: "critical", min: 0, max: 35, label: "Critical", description: "Pre-launch risk" }),
  Object.freeze({ id: "significant_gaps", min: 36, max: 65, label: "Significant Gaps", description: "Will break under real users" }),
  Object.freeze({ id: "getting_close", min: 66, max: 85, label: "Getting Close", description: "Needs hardening before production" }),
  Object.freeze({ id: "production_ready", min: 86, max: 100, label: "Production Ready", description: "Actually shippable" }),
]);

const SUMMARY_BY_TIER = Object.freeze({
  critical: "Critical: your app is not production-ready. Multiple high-severity issues found.",
  significant_gaps: "Significant gaps found. These will break in production under real load.",
  getting_close: "Getting close. Fix the remaining issues before launch.",
  production_ready: "Looking solid. Consider a deep audit for edge cases.",
});

function classifyScore(percent) {
  if (percent <= TIER_THRESHOLDS.CRITICAL_MAX) return "critical";
  if (percent <= TIER_THRESHOLDS.SIGNIFICANT_GAPS_MAX) return "significant_gaps";
  if (percent <= TIER_THRESHOLDS.GETTING_CLOSE_MAX) return "getting_close";
  return "production_ready";
}

function summaryForScore(percent) {
  return SUMMARY_BY_TIER[classifyScore(percent)];
}

function tierMetaForScore(percent) {
  const id = classifyScore(percent);
  return TIERS.find((tier) => tier.id === id);
}

export {
  TIER_THRESHOLDS,
  TIERS,
  SUMMARY_BY_TIER,
  classifyScore,
  summaryForScore,
  tierMetaForScore,
};
