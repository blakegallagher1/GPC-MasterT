/**
 * Browser-evidence validation.
 *
 * For UI or user-flow changes, evidence manifests are required as
 * first-class proof. This module provides types and validation helpers
 * for evidence artifacts produced by `harness:ui:capture-browser-evidence`.
 */

import { type RiskPolicyContract } from "./contract.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BrowserEvidenceEntry {
  flowName: string;
  entrypoint: string;
  accountIdentity: string;
  timestamp: string; // ISO-8601
  artifacts: string[];
}

export interface BrowserEvidenceManifest {
  headSha: string;
  entries: BrowserEvidenceEntry[];
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate that a browser-evidence manifest meets the contract
 * requirements.
 */
export function validateBrowserEvidence(
  manifest: BrowserEvidenceManifest,
  contract: RiskPolicyContract,
  currentHeadSha: string,
): void {
  const config = contract.browserEvidence;

  // SHA freshness
  if (manifest.headSha !== currentHeadSha) {
    throw new Error(
      `Browser evidence SHA mismatch: expected ${currentHeadSha}, got ${manifest.headSha}`,
    );
  }

  // Required flows present
  for (const flow of config.requiredFlows) {
    const found = manifest.entries.find((e) => e.flowName === flow);
    if (!found) {
      throw new Error(`Missing browser evidence for required flow: ${flow}`);
    }
  }

  // Required fields present on every entry
  for (const entry of manifest.entries) {
    for (const field of config.requiredFields) {
      const value = entry[field as keyof BrowserEvidenceEntry];
      if (value === undefined || value === null || value === "") {
        throw new Error(
          `Browser evidence entry "${entry.flowName}" missing required field: ${field}`,
        );
      }
    }
  }

  // Age check
  const maxAgeMs = config.maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const entry of manifest.entries) {
    const entryTime = new Date(entry.timestamp).getTime();
    if (now - entryTime > maxAgeMs) {
      throw new Error(
        `Browser evidence for "${entry.flowName}" is older than ${config.maxAgeDays} days`,
      );
    }
  }
}
