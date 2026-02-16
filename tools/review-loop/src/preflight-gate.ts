/**
 * Preflight gate.
 *
 * Runs before expensive CI fanout to verify deterministic policy and
 * review-agent state. This is the canonical entry point for the
 * risk-policy-gate workflow.
 *
 * Flow:
 *   1. Load contract and compute risk tier for changed files.
 *   2. Verify docs-drift rules.
 *   3. If code-review agent is required, wait for completion and
 *      assert no actionable findings for the current head SHA.
 *   4. Return the list of required checks so downstream CI can fan out.
 */

import {
  type RiskPolicyContract,
  type ReviewState,
  loadContract,
  computeRiskTier,
  computeRequiredChecks,
  needsCodeReviewAgent,
  assertDocsDriftRules,
  waitForReviewCompletion,
  assertReviewCleanForHead,
} from "@gpc/config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PreflightResult {
  riskTier: "high" | "low";
  requiredChecks: string[];
  reviewRequired: boolean;
  reviewClean: boolean;
  passed: boolean;
  errors: string[];
}

export interface PreflightOptions {
  changedFiles: string[];
  headSha: string;
  repoRoot?: string;
  /** Polling function to query review-agent state (injected by caller). */
  pollReview?: (sha: string) => Promise<ReviewState | null>;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function runPreflightGate(
  opts: PreflightOptions,
): Promise<PreflightResult> {
  const { changedFiles, headSha, repoRoot, pollReview } = opts;
  const errors: string[] = [];

  const contract: RiskPolicyContract = await loadContract(repoRoot);

  const riskTier = computeRiskTier(changedFiles, contract);
  const requiredChecks = computeRequiredChecks(changedFiles, contract);
  const reviewRequired = needsCodeReviewAgent(changedFiles, contract);

  // Docs-drift check
  try {
    assertDocsDriftRules(changedFiles, contract);
  } catch (err) {
    errors.push((err as Error).message);
  }

  // Review-agent check (only for tiers that require it)
  let reviewClean = true;
  if (reviewRequired && pollReview) {
    try {
      const reviewState = await waitForReviewCompletion({
        headSha,
        timeoutMinutes: contract.reviewAgent.timeoutMinutes,
        pollFn: pollReview,
      });
      assertReviewCleanForHead(reviewState, headSha);
    } catch (err) {
      reviewClean = false;
      errors.push((err as Error).message);
    }
  }

  return {
    riskTier,
    requiredChecks,
    reviewRequired,
    reviewClean,
    passed: errors.length === 0,
    errors,
  };
}
