/**
 * Risk-tier computation.
 *
 * Determines the effective risk tier for a set of changed files by
 * combining contract glob matches with semantic and historical signals.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

function matchedFiles(files: string[], patterns: string[]): string[] {
  return files.filter((file) => matchesAny(file, patterns));
}

/* ------------------------------------------------------------------ */
/*  Adaptive risk-scoring model                                        */
/* ------------------------------------------------------------------ */

export interface HistoricalSignalEntry {
  pattern: string;
  weight: number;
  reason: string;
}

export interface HistoricalRiskMetadata {
  version: string;
  recentFlakyTests: HistoricalSignalEntry[];
  incidentTaggedFiles: HistoricalSignalEntry[];
  priorRollbackAreas: HistoricalSignalEntry[];
}

export interface RiskExplanationSignal {
  category:
    | "contract-rule"
    | "semantic-public-api"
    | "semantic-auth-permissions"
    | "semantic-migration"
    | "semantic-workflow"
    | "history-flaky-tests"
    | "history-incidents"
    | "history-rollbacks";
  signal: string;
  weight: number;
  rationale: string;
  matchedFiles: string[];
}

export interface RiskAssessment {
  tier: RiskTier;
  score: number;
  threshold: number;
  changedFiles: string[];
  explanation: {
    triggeredSignals: RiskExplanationSignal[];
    scoreBreakdown: string[];
  };
}

const HIGH_RISK_THRESHOLD = 60;

const SEMANTIC_SIGNALS: Array<{
  category: RiskExplanationSignal["category"];
  signal: string;
  patterns: string[];
  weight: number;
  rationale: string;
}> = [
  {
    category: "semantic-public-api",
    signal: "public-api-change",
    patterns: ["**/src/index.ts", "**/*.d.ts", "app/api/**"],
    weight: 20,
    rationale: "Public API changes can impact downstream consumers.",
  },
  {
    category: "semantic-auth-permissions",
    signal: "auth-or-permissions-touchpoint",
    patterns: ["**/auth/**", "**/permissions/**", "**/rbac/**", "**/policy/**"],
    weight: 25,
    rationale: "Auth and permission changes are security-sensitive.",
  },
  {
    category: "semantic-migration",
    signal: "migration-change",
    patterns: ["**/migrations/**", "**/*.sql", "db/schema.ts"],
    weight: 20,
    rationale: "Schema/migration changes are higher-risk to production data paths.",
  },
  {
    category: "semantic-workflow",
    signal: "workflow-change",
    patterns: [".github/workflows/**", "scripts/**"],
    weight: 15,
    rationale: "Workflow changes can alter CI/CD and governance execution.",
  },
];

const EMPTY_HISTORICAL_METADATA: HistoricalRiskMetadata = {
  version: "1",
  recentFlakyTests: [],
  incidentTaggedFiles: [],
  priorRollbackAreas: [],
};

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

function scoreHistoricalSignals(
  files: string[],
  entries: HistoricalSignalEntry[],
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

  for (const semanticSignal of SEMANTIC_SIGNALS) {
    const matches = matchedFiles(files, semanticSignal.patterns);
    if (matches.length > 0) {
      triggeredSignals.push({
        category: semanticSignal.category,
        signal: semanticSignal.signal,
        weight: semanticSignal.weight,
        rationale: semanticSignal.rationale,
        matchedFiles: matches,
      });
    }
  }

  triggeredSignals.push(
    ...scoreHistoricalSignals(
      files,
      historicalMetadata.recentFlakyTests,
      "history-flaky-tests",
      "flaky",
    ),
    ...scoreHistoricalSignals(
      files,
      historicalMetadata.incidentTaggedFiles,
      "history-incidents",
      "incident",
    ),
    ...scoreHistoricalSignals(
      files,
      historicalMetadata.priorRollbackAreas,
      "history-rollbacks",
      "rollback",
    ),
  );

  const score = triggeredSignals.reduce((total, signal) => total + signal.weight, 0);
  const tier: RiskTier = score >= HIGH_RISK_THRESHOLD ? "high" : "low";
  const scoreBreakdown = triggeredSignals.map(
    (s) => `${s.signal} (+${s.weight}) => ${s.matchedFiles.join(", ")}`,
  );

  return {
    tier,
    score,
    threshold: HIGH_RISK_THRESHOLD,
    changedFiles: files,
    explanation: {
      triggeredSignals,
      scoreBreakdown,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Compute the effective risk tier for a set of changed files.
 */
export function computeRiskTier(
  changedFiles: string[],
  contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): RiskTier {
  return computeRiskAssessment(changedFiles, contract, historicalMetadata).tier;
}

/**
 * Return the list of required checks for a given risk tier.
 */
export function computeRequiredChecks(
  changedFiles: string[],
  contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): string[] {
  const tier = computeRiskTier(changedFiles, contract, historicalMetadata);
  return contract.mergePolicy[tier].requiredChecks;
}

/**
 * Determine whether a code-review agent run is needed for the given
 * changed files and risk tier.
 */
export function needsCodeReviewAgent(
  changedFiles: string[],
  contract: RiskPolicyContract,
  historicalMetadata: HistoricalRiskMetadata = EMPTY_HISTORICAL_METADATA,
): boolean {
  const tier = computeRiskTier(changedFiles, contract, historicalMetadata);
  return contract.mergePolicy[tier].requireCodeReviewAgent;
}
