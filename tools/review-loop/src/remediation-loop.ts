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

export interface ReviewFinding {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning" | "info";
  headSha: string;
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
  if (!config.skipStaleComments) {
    return findings.filter((f) => f.severity !== "info");
  }
  return findings.filter(
    (f) => f.headSha === currentHeadSha && f.severity !== "info",
  );
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
