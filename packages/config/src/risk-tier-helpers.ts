/**
 * Risk-tier helpers: glob matching, types, and semantic signal definitions.
 */

import { type RiskTier } from "./contract.js";

/* ------------------------------------------------------------------ */
/*  Glob matching                                                      */
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

export function matchedFiles(files: string[], patterns: string[]): string[] {
  return files.filter((file) => matchesAny(file, patterns));
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
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

/* ------------------------------------------------------------------ */
/*  Semantic signal definitions                                        */
/* ------------------------------------------------------------------ */

export const SEMANTIC_SIGNALS: Array<{
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

export const EMPTY_HISTORICAL_METADATA: HistoricalRiskMetadata = {
  version: "1",
  recentFlakyTests: [],
  incidentTaggedFiles: [],
  priorRollbackAreas: [],
};

export const HIGH_RISK_THRESHOLD = 60;
