/**
 * @gpc/review-loop — review automation utilities.
 */

export { runPreflightGate, type PreflightResult, type PreflightOptions } from "./preflight-gate.js";
export {
  findAutoResolvableThreads,
  autoResolveBotThreads,
  type ReviewThread,
  type ThreadComment,
  type AutoResolveResult,
} from "./auto-resolve.js";
export {
  normalizeReviewFindings,
  adjudicateFindings,
  filterCurrentFindings,
  runRemediationLoop,
  type FindingSeverity,
  type FindingConfidence,
  type FindingCategory,
  type ReviewFinding,
  type ReviewerFindingInput,
  type ReviewerProviderFindings,
  type RemediationConfig,
  type RemediationResult,
} from "./remediation-loop.js";
