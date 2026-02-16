/**
 * Risk-policy contract types and loader.
 *
 * Reads and validates the machine-readable risk-policy.contract.json
 * that defines risk tiers, merge policies, docs-drift rules, evidence
 * requirements, and agent configuration.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RiskTier = "high" | "low";

export interface MergePolicyEntry {
  requiredChecks: string[];
  requireCodeReviewAgent: boolean;
  requireBrowserEvidence: boolean;
}

export interface DocsDriftRules {
  controlPlanePaths: string[];
  requiredDocPaths: string[];
  coverageByPathClass?: {
    id: string;
    triggerPaths: string[];
    requiredDocPaths: string[];
    reason: string;
  }[];
}

export interface BrowserEvidenceConfig {
  requiredFlows: string[];
  requiredFields: string[];
  maxAgeDays: number;
}

export interface ReviewAgentConfig {
  name: string;
  rerunWorkflow: string;
  autoResolveWorkflow: string;
  timeoutMinutes: number;
}

export interface RemediationAgentConfig {
  name: string;
  enabled: boolean;
  pinModel: boolean;
  skipStaleComments: boolean;
}

export interface HarnessGapLoopConfig {
  enabled: boolean;
  issueLabel: string;
  slaTracking: boolean;
}

export interface RiskPolicyContract {
  version: string;
  riskTierRules: Record<RiskTier, string[]>;
  mergePolicy: Record<RiskTier, MergePolicyEntry>;
  docsDriftRules: DocsDriftRules;
  browserEvidence: BrowserEvidenceConfig;
  reviewAgent: ReviewAgentConfig;
  remediationAgent: RemediationAgentConfig;
  harnessGapLoop: HarnessGapLoopConfig;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const REQUIRED_TOP_KEYS: (keyof RiskPolicyContract)[] = [
  "version",
  "riskTierRules",
  "mergePolicy",
  "docsDriftRules",
  "browserEvidence",
  "reviewAgent",
  "remediationAgent",
  "harnessGapLoop",
];

export function validateContract(data: unknown): asserts data is RiskPolicyContract {
  if (typeof data !== "object" || data === null) {
    throw new Error("Contract must be a non-null object");
  }
  const obj = data as Record<string, unknown>;

  for (const key of REQUIRED_TOP_KEYS) {
    if (!(key in obj)) {
      throw new Error(`Contract missing required key: ${key}`);
    }
  }

  const tiers = obj["riskTierRules"] as Record<string, unknown>;
  if (!tiers["high"] || !tiers["low"]) {
    throw new Error("riskTierRules must contain 'high' and 'low' entries");
  }

  const policy = obj["mergePolicy"] as Record<string, unknown>;
  for (const tier of ["high", "low"] as const) {
    const entry = policy[tier] as Record<string, unknown> | undefined;
    if (!entry || !Array.isArray(entry["requiredChecks"])) {
      throw new Error(`mergePolicy.${tier} must contain requiredChecks array`);
    }
  }

  const docsRules = obj["docsDriftRules"] as Record<string, unknown>;
  if (docsRules["coverageByPathClass"] !== undefined) {
    if (!Array.isArray(docsRules["coverageByPathClass"])) {
      throw new Error("docsDriftRules.coverageByPathClass must be an array when present");
    }

    for (const [index, entry] of docsRules["coverageByPathClass"].entries()) {
      const item = entry as Record<string, unknown>;
      if (
        typeof item["id"] !== "string" ||
        !Array.isArray(item["triggerPaths"]) ||
        !Array.isArray(item["requiredDocPaths"]) ||
        typeof item["reason"] !== "string"
      ) {
        throw new Error(
          `docsDriftRules.coverageByPathClass[${index}] must include id, triggerPaths, requiredDocPaths, and reason`,
        );
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Loader                                                             */
/* ------------------------------------------------------------------ */

/**
 * Load and validate the risk-policy contract from the repository root.
 *
 * @param repoRoot - Absolute path to the repository root. Defaults to
 *   two directories above this file (assuming packages/config/src).
 */
export async function loadContract(
  repoRoot?: string,
): Promise<RiskPolicyContract> {
  const root = repoRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const contractPath = resolve(root, "risk-policy.contract.json");
  const raw = await readFile(contractPath, "utf-8");
  const data: unknown = JSON.parse(raw);
  validateContract(data);
  return data;
}
