/**
 * @gpc/config — machine-readable risk-policy contract utilities.
 *
 * Re-exports all public types and functions for the risk-policy
 * governance system.
 */

export {
  type RiskPolicyContract,
  type RiskTier,
  type MergePolicyEntry,
  type DocsDriftRules,
  type BrowserEvidenceConfig,
  type ReviewAgentConfig,
  type RemediationAgentConfig,
  type HarnessGapLoopConfig,
  loadContract,
  validateContract,
} from "./contract.js";

export {
  computeRiskTier,
  computeRequiredChecks,
  needsCodeReviewAgent,
  globToRegExp,
  matchesAny,
} from "./risk-tier.js";

export {
  type CheckRunResult,
  type ReviewState,
  assertCheckForCurrentHead,
  assertRequiredChecksSuccessful,
  assertReviewCleanForHead,
  waitForReviewCompletion,
} from "./sha-discipline.js";

export {
  type PrComment,
  type RerunWriterOptions,
  buildRerunComment,
  hasExistingRerunRequest,
  maybeRerunComment,
} from "./rerun-writer.js";

export { assertDocsDriftRules } from "./docs-drift.js";

export {
  type BrowserEvidenceEntry,
  type BrowserEvidenceManifest,
  validateBrowserEvidence,
} from "./browser-evidence.js";
