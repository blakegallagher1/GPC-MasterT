/**
 * SHA-discipline utilities.
 *
 * Ensures that review state, gate checks, and evidence are always
 * validated against the current PR head commit SHA. Stale results
 * tied to older SHAs are treated as invalid.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CheckRunResult {
  name: string;
  headSha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out" | null;
}

export interface ReviewState {
  headSha: string;
  status: "success" | "failure" | "pending";
  hasActionableFindings: boolean;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Assert that a check-run result references the current head SHA and
 * has a successful conclusion.
 */
export function assertCheckForCurrentHead(
  check: CheckRunResult,
  currentHeadSha: string,
): void {
  if (check.headSha !== currentHeadSha) {
    throw new Error(
      `Stale check "${check.name}": expected SHA ${currentHeadSha}, got ${check.headSha}`,
    );
  }
  if (check.status !== "completed") {
    throw new Error(`Check "${check.name}" is not completed (status: ${check.status})`);
  }
  if (check.conclusion !== "success") {
    throw new Error(
      `Check "${check.name}" did not succeed (conclusion: ${check.conclusion})`,
    );
  }
}

/**
 * Assert that all required checks have passing results for the current
 * head SHA.
 */
export function assertRequiredChecksSuccessful(
  checks: CheckRunResult[],
  requiredNames: string[],
  currentHeadSha: string,
): void {
  for (const name of requiredNames) {
    const check = checks.find((c) => c.name === name);
    if (!check) {
      throw new Error(`Required check "${name}" not found`);
    }
    assertCheckForCurrentHead(check, currentHeadSha);
  }
}

/**
 * Validate review-agent state for the current head SHA.
 *
 * - Review must be for the current SHA.
 * - Review must be successful.
 * - There must be no actionable findings.
 */
export function assertReviewCleanForHead(
  review: ReviewState,
  currentHeadSha: string,
): void {
  if (review.headSha !== currentHeadSha) {
    throw new Error(
      `Stale review: expected SHA ${currentHeadSha}, got ${review.headSha}`,
    );
  }
  if (review.status !== "success") {
    throw new Error(`Review did not succeed (status: ${review.status})`);
  }
  if (review.hasActionableFindings) {
    throw new Error("Review has unresolved actionable findings for current head");
  }
}

/**
 * Wait for a review-agent check run to appear and complete for the
 * given head SHA, with a configurable timeout.
 *
 * This is an abstract interface — callers supply a polling function
 * that queries the CI system for review status.
 */
export async function waitForReviewCompletion(opts: {
  headSha: string;
  timeoutMinutes: number;
  pollIntervalMs?: number;
  pollFn: (sha: string) => Promise<ReviewState | null>;
}): Promise<ReviewState> {
  const { headSha, timeoutMinutes, pollIntervalMs = 15_000, pollFn } = opts;
  const deadline = Date.now() + timeoutMinutes * 60_000;

  while (Date.now() < deadline) {
    const state = await pollFn(headSha);
    if (state && state.status !== "pending") {
      return state;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(
    `Review agent timed out after ${timeoutMinutes} minutes for SHA ${headSha}`,
  );
}
