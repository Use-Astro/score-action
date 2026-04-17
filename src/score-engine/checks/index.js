// Ported verbatim from Astro-Website/services/score-api/src/checks/index.js.
// The 22-check rubric must match the web scanner exactly. If a check is added,
// removed, renamed, or reordered there, mirror the change here.

import {
  checkJwtInLocalStorage,
  checkNoEnvSeparation,
  checkNoTestFiles,
  checkNoErrorBoundaries,
  checkNoDbMigrations,
  checkNoInputValidation,
  checkNoLogging,
  checkEnvCommitted,
  checkMissingApiAuthGuards,
  checkCrossTenantLeakage,
  checkNoRateLimiting,
  checkWebhookSignatureNotVerified,
  checkUnboundedQueries,
  checkOpenCors,
  checkClientServerBoundaryViolations,
  checkUnrestrictedFileUploads,
  checkNoDbTransactions,
  checkInsecureCookieSession,
} from "./high-priority.js";

import {
  checkNoCiCd,
  checkMissingLockfile,
  checkMissingDbIndexes,
  checkNoTimeoutsOnExternalCalls,
} from "./medium-priority.js";

import { summaryForScore } from "../score-tiers.js";

const CHECK_DEFINITIONS = [
  { id: 1, name: "JWT in localStorage", priority: "high", fn: checkJwtInLocalStorage },
  { id: 2, name: "No environment separation / hardcoded secrets", priority: "high", fn: checkNoEnvSeparation },
  { id: 3, name: "No test files", priority: "high", fn: checkNoTestFiles },
  { id: 4, name: "No error boundaries", priority: "high", fn: checkNoErrorBoundaries },
  { id: 5, name: "No database migrations", priority: "high", fn: checkNoDbMigrations },
  { id: 6, name: "No input validation", priority: "high", fn: checkNoInputValidation },
  { id: 7, name: "No logging / observability", priority: "high", fn: checkNoLogging },
  { id: 8, name: ".env committed to git", priority: "high", fn: checkEnvCommitted },
  { id: 9, name: "Missing API auth guards", priority: "high", fn: checkMissingApiAuthGuards },
  { id: 10, name: "Cross-tenant query leakage", priority: "high", fn: checkCrossTenantLeakage },
  { id: 11, name: "No rate limiting", priority: "high", fn: checkNoRateLimiting },
  { id: 12, name: "Webhook signature not verified", priority: "high", fn: checkWebhookSignatureNotVerified },
  { id: 13, name: "Unbounded queries / no pagination", priority: "high", fn: checkUnboundedQueries },
  { id: 14, name: "Open CORS on authenticated APIs", priority: "high", fn: checkOpenCors },
  { id: 15, name: "Client/server boundary violations", priority: "high", fn: checkClientServerBoundaryViolations },
  { id: 16, name: "Unrestricted file uploads", priority: "high", fn: checkUnrestrictedFileUploads },
  { id: 17, name: "No DB transactions for multi-write flows", priority: "high", fn: checkNoDbTransactions },
  { id: 18, name: "Insecure cookie / session flags", priority: "high", fn: checkInsecureCookieSession },
  { id: 19, name: "No CI/CD config", priority: "medium", fn: checkNoCiCd },
  { id: 20, name: "Non-reproducible build (missing lockfile)", priority: "medium", fn: checkMissingLockfile },
  { id: 21, name: "Missing DB indexes on hot filters", priority: "medium", fn: checkMissingDbIndexes },
  { id: 22, name: "No timeouts on external HTTP calls", priority: "medium", fn: checkNoTimeoutsOnExternalCalls },
];

function getSummary(overallScore) {
  return summaryForScore(overallScore);
}

function runAllChecks(ctx) {
  const checks = [];

  for (const def of CHECK_DEFINITIONS) {
    try {
      const result = def.fn(ctx);
      checks.push({
        id: def.id,
        name: def.name,
        priority: def.priority,
        status: result.notApplicable ? "na" : result.passed ? "pass" : "fail",
        passed: result.notApplicable ? null : result.passed,
        details: result.details,
      });
    } catch (error) {
      console.error("check_analysis_error", {
        check_id: def.id,
        check_name: def.name,
        error: error instanceof Error ? error.message : "unknown",
      });
      checks.push({
        id: def.id,
        name: def.name,
        priority: def.priority,
        status: "error",
        passed: null,
        details: "Unable to analyze. Check could not be completed.",
      });
    }
  }

  const applicableChecks = checks.filter((c) => c.status === "pass" || c.status === "fail");
  const passedCount = checks.filter((c) => c.status === "pass").length;
  const applicableCount = applicableChecks.length;
  const overallScore = applicableCount > 0 ? Math.round((passedCount / applicableCount) * 100) : 100;
  const summary = getSummary(overallScore);
  const complexityTier = ctx.files.length <= 50 ? "small" : ctx.files.length <= 500 ? "medium" : ctx.files.length <= 2000 ? "large" : "enterprise";

  return {
    checks,
    overallScore,
    applicableCount,
    passedCount,
    summary,
    complexityTier,
  };
}

export { CHECK_DEFINITIONS, runAllChecks };
