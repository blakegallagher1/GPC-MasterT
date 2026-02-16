/**
 * Risk-tier computation.
 *
 * Determines the effective risk tier for a set of changed files by
 * combining contract glob matches with semantic and historical signals.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type RiskPolicyContract, type RiskTier } from "./contract.js";
import {
  type HistoricalRiskMetadata,
  type RiskAssessment,
  type RiskExplanationSignal,
  matchedFiles,
  SEMANTIC_SIGNALS,
  EMPTY_HISTORICAL_METADATA,
  HIGH_RISK_THRESHOLD,
} from "./risk-tier-helpers.js";

export type {
  HistoricalSignalEntry,
  HistoricalRiskMetadata,
  RiskExplanationSignal,
  RiskAssessment,
} from "./risk-tier-helpers.js";
export { globToRegExp, matchesAny } from "./risk-tier-helpers.js";

/* ------------------------------------------------------------------ */
/*  Metadata loader                                                    */
/* ------------------------------------------------------------------ */

export async function loadHistoricalRiskMetadata(
  rootDir: string = process.cwd(),
): Promise<HistoricalRiskMetadata> {
  const metadataPath = resolve(rootDir, "risk-signals.metadata.json");
  const data = await readFile(metadataPath, "utf-8");
  const parsed = JSON.parse(data) as Partial<HistoricalRiskMetadata>;
  return {
    version: parsed.version ?? "1",
    recentFlakyTests: parsed.recentFlakyTests ?? [],
    incidentTaggedFiles: parsed.incidentTaggedFiles ?? [],
    priorRollbackAreas: parsed.priorRollbackAreas ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  Scoring helpers                                                    */
/* ------------------------------------------------------------------ */

function scoreHistoricalSignals(
  files: string[],
  entries: { pattern: string; weight: number; reason: string }[],
  category: RiskExplanationSignal["category"],
  signalPrefix: string,
): RiskExplanationSignal[] {
  const signals: RiskExplanationSignal[] = [];
  for (const entry of entries) {
    const matches = matchedFiles(files, [entry.pattern]);
    if (matches.length > 0) {
      signals.push({
        category,
        signal: `${signalPrefix}:${entry.pattern}`,
        weight: entry.weight,
        rationale: entry.reason,
        matchedFiles: matches,
      });
    }
  }
  return signals;
}

/* ------------------------------------------------------------------ */
/*  Core assessment                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compute adaptive risk tier, score, and transparent explanation.
 */
export function computeRiskAssessment(
  changedFiles: string[],
  contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): RiskAssessment {
  const files = [...changedFiles].sort();
  const triggeredSignals: RiskExplanationSignal[] = [];

  const highRuleMatches = matchedFiles(files, contract.riskTierRules.high);
  if (highRuleMatches.length > 0) {
    triggeredSignals.push({
      category: "contract-rule",
      signal: "high-tier-contract-pattern",
      weight: 70,
      rationale: "Matched explicit high-risk pattern from risk-policy contract.",
      matchedFiles: highRuleMatches,
    });
  }

  for (const s of SEMANTIC_SIGNALS) {
    const matches = matchedFiles(files, s.patterns);
    if (matches.length > 0) {
      triggeredSignals.push({
        category: s.category, signal: s.signal,
        weight: s.weight, rationale: s.rationale, matchedFiles: matches,
      });
    }
  }

  triggeredSignals.push(
    ...scoreHistoricalSignals(files, historicalMetadata.recentFlakyTests, "history-flaky-tests", "flaky"),
    ...scoreHistoricalSignals(files, historicalMetadata.incidentTaggedFiles, "history-incidents", "incident"),
    ...scoreHistoricalSignals(files, historicalMetadata.priorRollbackAreas, "history-rollbacks", "rollback"),
  );

  const score = triggeredSignals.reduce((total, sig) => total + sig.weight, 0);
  const tier: RiskTier = score >= HIGH_RISK_THRESHOLD ? "high" : "low";
  const scoreBreakdown = triggeredSignals.map(
    (s) => `${s.signal} (+${s.weight}) => ${s.matchedFiles.join(", ")}`,
  );

  return { tier, score, threshold: HIGH_RISK_THRESHOLD, changedFiles: files, explanation: { triggeredSignals, scoreBreakdown } };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function computeRiskTier(
  changedFiles: string[], contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): RiskTier {
  return computeRiskAssessment(changedFiles, contract, historicalMetadata).tier;
}

export function computeRequiredChecks(
  changedFiles: string[], contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): string[] {
  const tier = computeRiskTier(changedFiles, contract, historicalMetadata);
  return contract.mergePolicy[tier].requiredChecks;
}

export function needsCodeReviewAgent(
  changedFiles: string[], contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): boolean {
  const tier = computeRiskTier(changedFiles, contract, historicalMetadata);
  return contract.mergePolicy[tier].requireCodeReviewAgent;
}
