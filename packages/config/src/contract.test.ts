import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { validateContract } from "./contract.js";
import { computeRiskAssessment, computeRiskTier, computeRequiredChecks, needsCodeReviewAgent, globToRegExp, matchesAny } from "./risk-tier.js";
import { assertDocsDriftRules } from "./docs-drift.js";
import { assertCheckForCurrentHead, assertRequiredChecksSuccessful, assertReviewCleanForHead } from "./sha-discipline.js";
import { buildRerunComment, hasExistingRerunRequest, maybeRerunComment } from "./rerun-writer.js";
import { validateBrowserEvidence } from "./browser-evidence.js";
import type { RiskPolicyContract } from "./contract.js";
import type { CheckRunResult, ReviewState } from "./sha-discipline.js";
import type { PrComment } from "./rerun-writer.js";
import type { BrowserEvidenceManifest } from "./browser-evidence.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const VALID_CONTRACT: RiskPolicyContract = {
  version: "1",
  riskTierRules: {
    high: ["app/api/legal-chat/**", "lib/tools/**", "db/schema.ts"],
    low: ["**"],
  },
  mergePolicy: {
    high: {
      requiredChecks: ["risk-policy-gate", "harness-smoke", "Browser Evidence", "CI Pipeline"],
      requireCodeReviewAgent: true,
      requireBrowserEvidence: true,
    },
    low: {
      requiredChecks: ["risk-policy-gate", "CI Pipeline"],
      requireCodeReviewAgent: false,
      requireBrowserEvidence: false,
    },
  },
  docsDriftRules: {
    controlPlanePaths: ["risk-policy.contract.json", ".github/workflows/**"],
    requiredDocPaths: ["docs/playbooks/**", "docs/operating-model/**"],
  },
  browserEvidence: {
    requiredFlows: ["legal-chat-login"],
    requiredFields: ["entrypoint", "accountIdentity", "timestamp", "flowName"],
    maxAgeDays: 7,
  },
  reviewAgent: {
    name: "Greptile",
    rerunWorkflow: "greptile-rerun.yml",
    autoResolveWorkflow: "greptile-auto-resolve-threads.yml",
    timeoutMinutes: 20,
  },
  remediationAgent: {
    name: "Codex Action",
    enabled: true,
    pinModel: true,
    skipStaleComments: true,
  },
  harnessGapLoop: {
    enabled: true,
    issueLabel: "harness-gap",
    slaTracking: true,
  },
};

/* ------------------------------------------------------------------ */
/*  Contract validation                                                */
/* ------------------------------------------------------------------ */

describe("validateContract", () => {
  it("accepts a valid contract", () => {
    assert.doesNotThrow(() => validateContract(VALID_CONTRACT));
  });

  it("rejects null", () => {
    assert.throws(() => validateContract(null), /non-null object/);
  });

  it("rejects missing top-level keys", () => {
    assert.throws(() => validateContract({ version: "1" }), /missing required key/);
  });

  it("rejects missing risk tiers", () => {
    const bad = { ...VALID_CONTRACT, riskTierRules: { high: [] } };
    assert.throws(() => validateContract(bad), /must contain.*low/);
  });

  it("rejects missing requiredChecks in merge policy", () => {
    const bad = {
      ...VALID_CONTRACT,
      mergePolicy: { high: {}, low: { requiredChecks: [] } },
    };
    assert.throws(() => validateContract(bad), /requiredChecks/);
  });
});

/* ------------------------------------------------------------------ */
/*  Glob matching                                                      */
/* ------------------------------------------------------------------ */

describe("globToRegExp", () => {
  it("matches ** wildcard", () => {
    const re = globToRegExp("app/api/legal-chat/**");
    assert.ok(re.test("app/api/legal-chat/route.ts"));
    assert.ok(re.test("app/api/legal-chat/deep/nested/file.ts"));
    assert.ok(!re.test("app/api/other/route.ts"));
  });

  it("matches * wildcard", () => {
    const re = globToRegExp("lib/*.ts");
    assert.ok(re.test("lib/utils.ts"));
    assert.ok(!re.test("lib/deep/utils.ts"));
  });

  it("matches exact file", () => {
    const re = globToRegExp("db/schema.ts");
    assert.ok(re.test("db/schema.ts"));
    assert.ok(!re.test("db/schema.tsx"));
  });
});

/* ------------------------------------------------------------------ */
/*  Risk tier computation                                              */
/* ------------------------------------------------------------------ */

describe("computeRiskTier", () => {
  it("returns high for legal-chat files", () => {
    assert.equal(
      computeRiskTier(["app/api/legal-chat/route.ts"], VALID_CONTRACT),
      "high",
    );
  });

  it("returns high for db/schema.ts", () => {
    assert.equal(
      computeRiskTier(["db/schema.ts"], VALID_CONTRACT),
      "high",
    );
  });

  it("returns low for unrelated files", () => {
    assert.equal(
      computeRiskTier(["README.md", "src/utils.ts"], VALID_CONTRACT),
      "low",
    );
  });

  it("returns high if any file matches high pattern", () => {
    assert.equal(
      computeRiskTier(["README.md", "lib/tools/parser.ts"], VALID_CONTRACT),
      "high",
    );
  });
});



describe("computeRiskAssessment", () => {
  const metadata = {
    version: "1",
    recentFlakyTests: [
      {
        pattern: "tests/smoke/**",
        weight: 10,
        reason: "smoke flake",
      },
    ],
    incidentTaggedFiles: [
      {
        pattern: "app/api/legal-chat/**",
        weight: 20,
        reason: "incident area",
      },
    ],
    priorRollbackAreas: [
      {
        pattern: ".github/workflows/**",
        weight: 12,
        reason: "prior rollback",
      },
    ],
  };

  it("scores deterministically and returns high tier when threshold is met", () => {
    const changed = [
      "tests/smoke/run.sh",
      "app/api/legal-chat/route.ts",
      ".github/workflows/ci.yml",
    ];

    const first = computeRiskAssessment(changed, VALID_CONTRACT, metadata);
    const second = computeRiskAssessment([...changed].reverse(), VALID_CONTRACT, metadata);

    assert.equal(first.score, 147);
    assert.equal(first.tier, "high");
    assert.deepEqual(first, second);
  });

  it("returns transparent explanation with triggered categories", () => {
    const result = computeRiskAssessment(
      ["app/api/legal-chat/route.ts", "tests/smoke/run.sh"],
      VALID_CONTRACT,
      metadata,
    );

    const categories = result.explanation.triggeredSignals.map((s) => s.category);
    assert.ok(categories.includes("contract-rule"));
    assert.ok(categories.includes("semantic-public-api"));
    assert.ok(categories.includes("history-incidents"));
    assert.ok(categories.includes("history-flaky-tests"));
    assert.ok(result.explanation.scoreBreakdown.every((entry) => entry.includes("(+")));
  });
});

describe("computeRequiredChecks", () => {
  it("returns high-tier checks for high-risk files", () => {
    const checks = computeRequiredChecks(["db/schema.ts"], VALID_CONTRACT);
    assert.ok(checks.includes("harness-smoke"));
    assert.ok(checks.includes("Browser Evidence"));
  });

  it("returns low-tier checks for low-risk files", () => {
    const checks = computeRequiredChecks(["README.md"], VALID_CONTRACT);
    assert.ok(checks.includes("risk-policy-gate"));
    assert.ok(checks.includes("CI Pipeline"));
    assert.ok(!checks.includes("harness-smoke"));
  });
});

describe("needsCodeReviewAgent", () => {
  it("returns true for high-tier changes", () => {
    assert.equal(needsCodeReviewAgent(["db/schema.ts"], VALID_CONTRACT), true);
  });

  it("returns false for low-tier changes", () => {
    assert.equal(needsCodeReviewAgent(["README.md"], VALID_CONTRACT), false);
  });
});

/* ------------------------------------------------------------------ */
/*  SHA discipline                                                     */
/* ------------------------------------------------------------------ */

describe("assertCheckForCurrentHead", () => {
  const check: CheckRunResult = {
    name: "CI Pipeline",
    headSha: "abc123",
    status: "completed",
    conclusion: "success",
  };

  it("passes for matching SHA and success", () => {
    assert.doesNotThrow(() => assertCheckForCurrentHead(check, "abc123"));
  });

  it("fails for stale SHA", () => {
    assert.throws(
      () => assertCheckForCurrentHead(check, "def456"),
      /Stale check/,
    );
  });

  it("fails for non-completed check", () => {
    assert.throws(
      () => assertCheckForCurrentHead({ ...check, status: "in_progress" }, "abc123"),
      /not completed/,
    );
  });

  it("fails for non-success conclusion", () => {
    assert.throws(
      () => assertCheckForCurrentHead({ ...check, conclusion: "failure" }, "abc123"),
      /did not succeed/,
    );
  });
});

describe("assertRequiredChecksSuccessful", () => {
  it("passes when all required checks succeed", () => {
    const checks: CheckRunResult[] = [
      { name: "risk-policy-gate", headSha: "abc", status: "completed", conclusion: "success" },
      { name: "CI Pipeline", headSha: "abc", status: "completed", conclusion: "success" },
    ];
    assert.doesNotThrow(() =>
      assertRequiredChecksSuccessful(checks, ["risk-policy-gate", "CI Pipeline"], "abc"),
    );
  });

  it("fails when a required check is missing", () => {
    assert.throws(
      () => assertRequiredChecksSuccessful([], ["CI Pipeline"], "abc"),
      /not found/,
    );
  });
});

describe("assertReviewCleanForHead", () => {
  it("passes for clean review at current SHA", () => {
    const review: ReviewState = { headSha: "abc", status: "success", hasActionableFindings: false };
    assert.doesNotThrow(() => assertReviewCleanForHead(review, "abc"));
  });

  it("fails for stale review", () => {
    const review: ReviewState = { headSha: "old", status: "success", hasActionableFindings: false };
    assert.throws(() => assertReviewCleanForHead(review, "abc"), /Stale review/);
  });

  it("fails for review with findings", () => {
    const review: ReviewState = { headSha: "abc", status: "success", hasActionableFindings: true };
    assert.throws(() => assertReviewCleanForHead(review, "abc"), /actionable findings/);
  });
});

/* ------------------------------------------------------------------ */
/*  Rerun writer                                                       */
/* ------------------------------------------------------------------ */

describe("rerun-writer", () => {
  it("builds a correctly formatted comment", () => {
    const body = buildRerunComment("sha123");
    assert.ok(body.includes("<!-- risk-policy-rerun-request -->"));
    assert.ok(body.includes("sha:sha123"));
    assert.ok(body.includes("@review-agent please re-review"));
  });

  it("detects existing rerun request", () => {
    const comments: PrComment[] = [
      { id: 1, body: "<!-- risk-policy-rerun-request -->\n@review-agent please re-review\nsha:abc123", user: "bot" },
    ];
    assert.equal(hasExistingRerunRequest(comments, "abc123"), true);
    assert.equal(hasExistingRerunRequest(comments, "def456"), false);
  });

  it("returns null when rerun already exists", () => {
    const comments: PrComment[] = [
      { id: 1, body: "<!-- risk-policy-rerun-request -->\nsha:abc", user: "bot" },
    ];
    assert.equal(maybeRerunComment(comments, "abc"), null);
  });

  it("returns comment body when no existing rerun", () => {
    const result = maybeRerunComment([], "abc");
    assert.ok(result !== null);
    assert.ok(result!.includes("sha:abc"));
  });
});

/* ------------------------------------------------------------------ */
/*  Docs drift                                                         */
/* ------------------------------------------------------------------ */

describe("assertDocsDriftRules", () => {
  it("passes when no control-plane files changed", () => {
    assert.doesNotThrow(() =>
      assertDocsDriftRules(["src/index.ts"], VALID_CONTRACT),
    );
  });

  it("passes when control-plane + docs both changed", () => {
    assert.doesNotThrow(() =>
      assertDocsDriftRules(
        ["risk-policy.contract.json", "docs/playbooks/pr-lifecycle.md"],
        VALID_CONTRACT,
      ),
    );
  });

  it("fails when control-plane changed without docs", () => {
    assert.throws(
      () => assertDocsDriftRules(["risk-policy.contract.json"], VALID_CONTRACT),
      /documentation was updated/,
    );
  });

  it("fails when workflow changed without docs", () => {
    assert.throws(
      () => assertDocsDriftRules([".github/workflows/ci.yml"], VALID_CONTRACT),
      /documentation was updated/,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Browser evidence                                                   */
/* ------------------------------------------------------------------ */

describe("validateBrowserEvidence", () => {
  const validManifest: BrowserEvidenceManifest = {
    headSha: "abc",
    entries: [
      {
        flowName: "legal-chat-login",
        entrypoint: "/login",
        accountIdentity: "test@example.com",
        timestamp: new Date().toISOString(),
        artifacts: ["screenshot-1.png"],
      },
    ],
  };

  it("passes for valid manifest", () => {
    assert.doesNotThrow(() =>
      validateBrowserEvidence(validManifest, VALID_CONTRACT, "abc"),
    );
  });

  it("fails for SHA mismatch", () => {
    assert.throws(
      () => validateBrowserEvidence(validManifest, VALID_CONTRACT, "xyz"),
      /SHA mismatch/,
    );
  });

  it("fails for missing required flow", () => {
    const bad: BrowserEvidenceManifest = { headSha: "abc", entries: [] };
    assert.throws(
      () => validateBrowserEvidence(bad, VALID_CONTRACT, "abc"),
      /Missing browser evidence/,
    );
  });

  it("fails for stale evidence", () => {
    const stale: BrowserEvidenceManifest = {
      headSha: "abc",
      entries: [
        {
          ...validManifest.entries[0],
          timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
    assert.throws(
      () => validateBrowserEvidence(stale, VALID_CONTRACT, "abc"),
      /older than/,
    );
  });
});
