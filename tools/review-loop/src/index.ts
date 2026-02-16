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
  filterCurrentFindings,
  runRemediationLoop,
  type ReviewFinding,
  type RemediationConfig,
  type RemediationResult,
} from "./remediation-loop.js";
