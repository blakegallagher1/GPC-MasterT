/**
 * Risk-tier computation.
 *
 * Determines the effective risk tier for a set of changed files by
 * matching against glob patterns defined in the risk-policy contract.
 */

import { type RiskPolicyContract, type RiskTier } from "./contract.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a simple glob pattern to a RegExp.
 *
 * Supports `*` (single-segment wildcard) and `**` (multi-segment
 * wildcard) which is sufficient for the patterns used in the contract.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Check whether a file path matches any of the given glob patterns.
 */
export function matchesAny(filePath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(filePath));
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Compute the effective risk tier for a set of changed files.
 *
 * If **any** file matches a `high` pattern the overall tier is `high`.
 * Otherwise the tier falls through to `low` (which matches `**`).
 */
export function computeRiskTier(
  changedFiles: string[],
  contract: RiskPolicyContract,
): RiskTier {
  const highPatterns = contract.riskTierRules.high;
  for (const file of changedFiles) {
    if (matchesAny(file, highPatterns)) {
      return "high";
    }
  }
  return "low";
}

/**
 * Return the list of required checks for a given risk tier.
 */
export function computeRequiredChecks(
  changedFiles: string[],
  contract: RiskPolicyContract,
): string[] {
  const tier = computeRiskTier(changedFiles, contract);
  return contract.mergePolicy[tier].requiredChecks;
}

/**
 * Determine whether a code-review agent run is needed for the given
 * changed files and risk tier.
 */
export function needsCodeReviewAgent(
  changedFiles: string[],
  contract: RiskPolicyContract,
): boolean {
  const tier = computeRiskTier(changedFiles, contract);
  return contract.mergePolicy[tier].requireCodeReviewAgent;
}
