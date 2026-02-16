/**
 * Automated remediation loop.
 *
 * When review findings are actionable, this module coordinates a coding
 * agent to:
 *   1. Read review context for the current head SHA.
 *   2. Patch code based on findings.
 *   3. Run focused local validation.
 *   4. Push a fix commit to the same PR branch.
 *
 * Then the normal PR synchronize event triggers a rerun.
 *
 * Guardrails:
 *   - Pinned model + effort for reproducibility.
 *   - Skip stale comments not matching current head.
 *   - Never bypass policy gates.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingConfidence = "high" | "medium" | "low";
export type FindingCategory =
  | "style"
  | "security"
  | "architecture"
  | "correctness"
  | "performance"
  | "maintainability"
  | "other";

export interface ReviewFinding {
  providers: string[];
  file: string;
  line: number;
  message: string;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  category: FindingCategory;
  headSha: string;
  fingerprint?: string;
}

export interface ReviewerFindingInput {
  file: string;
  line: number;
  message: string;
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  category?: FindingCategory;
  headSha: string;
  fingerprint?: string;
}

export interface ReviewerProviderFindings {
  provider: string;
  findings: ReviewerFindingInput[];
}

export interface RemediationConfig {
  pinModel: boolean;
  skipStaleComments: boolean;
  maxAttempts: number;
}

export interface RemediationResult {
  attempted: number;
  succeeded: number;
  skipped: number;
  errors: string[];
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

const CONFIDENCE_RANK: Record<FindingConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/* ------------------------------------------------------------------ */
/*  Normalization + adjudication                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalize provider-specific findings into a shared schema.
 */
export function normalizeReviewFindings(
  providers: ReviewerProviderFindings[],
): ReviewFinding[] {
  return providers.flatMap(({ provider, findings }) =>
    findings.map((finding) => ({
      providers: [provider],
      file: finding.file,
      line: finding.line,
      message: finding.message,
      severity: finding.severity ?? "medium",
      confidence: finding.confidence ?? "medium",
      category: finding.category ?? "other",
      headSha: finding.headSha,
      fingerprint: finding.fingerprint,
    })),
  );
}

function findingPriority(finding: Pick<ReviewFinding, "severity" | "confidence">): number {
  return SEVERITY_RANK[finding.severity] * 10 + CONFIDENCE_RANK[finding.confidence];
}

function buildDuplicateKey(finding: ReviewFinding): string {
  if (finding.fingerprint) {
    return finding.fingerprint;
  }
  const normalizedMessage = finding.message.trim().toLowerCase().replace(/\s+/g, " ");
  return `${finding.file}:${finding.line}:${finding.category}:${normalizedMessage}`;
}

/**
 * Merge duplicate findings emitted by different reviewers and sort by
 * highest remediation priority (severity + confidence).
 */
export function adjudicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const merged = new Map<string, ReviewFinding>();

  for (const finding of findings) {
    const key = buildDuplicateKey(finding);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...finding, providers: [...finding.providers] });
      continue;
    }

    const winner = findingPriority(finding) > findingPriority(existing) ? finding : existing;

    merged.set(key, {
      ...winner,
      providers: Array.from(new Set([...existing.providers, ...finding.providers])).sort(),
      fingerprint: existing.fingerprint ?? finding.fingerprint,
    });
  }

  return Array.from(merged.values()).sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }

    const confidenceDelta = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }

    return a.line - b.line;
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Filter findings to only those that are actionable for the current
 * head SHA.
 */
export function filterCurrentFindings(
  findings: ReviewFinding[],
  currentHeadSha: string,
  config: RemediationConfig,
): ReviewFinding[] {
  const withoutInformational = findings.filter((f) => f.severity !== "info");
  const freshFindings = config.skipStaleComments
    ? withoutInformational.filter((f) => f.headSha === currentHeadSha)
    : withoutInformational;

  return adjudicateFindings(freshFindings);
}

/**
 * Run the remediation loop for actionable findings.
 *
 * Callers supply:
 *   - `applyFix`: a function that attempts to fix a single finding
 *     (e.g. by invoking a coding agent).
 *   - `validate`: a function that runs focused validation after a fix.
 */
export async function runRemediationLoop(opts: {
  findings: ReviewFinding[];
  currentHeadSha: string;
  config: RemediationConfig;
  applyFix: (finding: ReviewFinding) => Promise<boolean>;
  validate: () => Promise<boolean>;
}): Promise<RemediationResult> {
  const { findings, currentHeadSha, config, applyFix, validate } = opts;

  const actionable = filterCurrentFindings(findings, currentHeadSha, config);
  const result: RemediationResult = {
    attempted: 0,
    succeeded: 0,
    skipped: findings.length - actionable.length,
    errors: [],
  };

  for (const finding of actionable) {
    if (result.attempted >= config.maxAttempts) {
      result.errors.push(
        `Reached max remediation attempts (${config.maxAttempts})`,
      );
      break;
    }

    result.attempted++;
    try {
      const fixed = await applyFix(finding);
      if (fixed) {
        const valid = await validate();
        if (valid) {
          result.succeeded++;
        } else {
          result.errors.push(
            `Fix for ${finding.file}:${finding.line} failed validation`,
          );
        }
      } else {
        result.errors.push(
          `Could not apply fix for ${finding.file}:${finding.line}`,
        );
      }
    } catch (err) {
      result.errors.push(
        `Error fixing ${finding.file}:${finding.line}: ${(err as Error).message}`,
      );
    }
  }

  return result;
}
