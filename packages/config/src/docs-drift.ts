/**
 * Docs-drift detection.
 *
 * When control-plane files change (contract, workflows, AGENTS.md) this
 * module asserts that at least one required documentation path was also
 * touched — preventing silent drift between implementation and docs.
 */

import { matchesAny } from "./risk-tier.js";
import { type RiskPolicyContract } from "./contract.js";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Assert that docs-drift rules are satisfied for a set of changed files.
 *
 * Throws if control-plane paths are touched but none of the required
 * documentation paths appear in the changeset.
 */
export function assertDocsDriftRules(
  changedFiles: string[],
  contract: RiskPolicyContract,
): void {
  const { controlPlanePaths, requiredDocPaths } = contract.docsDriftRules;

  const hasControlPlaneChange = changedFiles.some((f) =>
    matchesAny(f, controlPlanePaths),
  );

  if (!hasControlPlaneChange) {
    return; // no control-plane files touched — nothing to check
  }

  const hasDocChange = changedFiles.some((f) =>
    matchesAny(f, requiredDocPaths),
  );

  if (!hasDocChange) {
    throw new Error(
      "Control-plane files changed but no documentation was updated. " +
        "Please update at least one file matching: " +
        requiredDocPaths.join(", "),
    );
  }
}
