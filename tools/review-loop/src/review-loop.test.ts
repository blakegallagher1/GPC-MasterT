import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  findAutoResolvableThreads,
  autoResolveBotThreads,
} from "./auto-resolve.js";
import {
  normalizeReviewFindings,
  adjudicateFindings,
  filterCurrentFindings,
  runRemediationLoop,
} from "./remediation-loop.js";
import type { ReviewThread } from "./auto-resolve.js";
import type { ReviewFinding, RemediationConfig } from "./remediation-loop.js";

/* ------------------------------------------------------------------ */
/*  Auto-resolve                                                       */
/* ------------------------------------------------------------------ */

describe("findAutoResolvableThreads", () => {
  const botUser = "greptile[bot]";

  it("returns bot-only unresolved threads", () => {
    const threads: ReviewThread[] = [
      {
        id: "t1",
        isResolved: false,
        comments: [{ user: botUser, body: "finding" }],
      },
      {
        id: "t2",
        isResolved: false,
        comments: [
          { user: botUser, body: "finding" },
          { user: "human", body: "I disagree" },
        ],
      },
    ];
    const result = findAutoResolvableThreads(threads, botUser);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "t1");
  });

  it("skips already resolved threads", () => {
    const threads: ReviewThread[] = [
      {
        id: "t1",
        isResolved: true,
        comments: [{ user: botUser, body: "finding" }],
      },
    ];
    assert.equal(findAutoResolvableThreads(threads, botUser).length, 0);
  });

  it("skips empty threads", () => {
    const threads: ReviewThread[] = [
      { id: "t1", isResolved: false, comments: [] },
    ];
    assert.equal(findAutoResolvableThreads(threads, botUser).length, 0);
  });
});

describe("autoResolveBotThreads", () => {
  it("resolves bot-only threads and skips human threads", async () => {
    const resolved: string[] = [];
    const threads: ReviewThread[] = [
      {
        id: "t1",
        isResolved: false,
        comments: [{ user: "bot", body: "issue" }],
      },
      {
        id: "t2",
        isResolved: false,
        comments: [
          { user: "bot", body: "issue" },
          { user: "human", body: "context" },
        ],
      },
    ];

    const result = await autoResolveBotThreads({
      threads,
      botUser: "bot",
      resolveFn: async (id) => { resolved.push(id); },
    });

    assert.deepEqual(result.resolved, ["t1"]);
    assert.deepEqual(result.skipped, ["t2"]);
    assert.deepEqual(resolved, ["t1"]);
  });
});

/* ------------------------------------------------------------------ */
/*  Remediation loop                                                   */
/* ------------------------------------------------------------------ */

describe("normalizeReviewFindings", () => {
  it("normalizes provider specific findings into the shared schema", () => {
    const normalized = normalizeReviewFindings([
      {
        provider: "security-reviewer",
        findings: [
          {
            file: "auth.ts",
            line: 12,
            message: "Potential token leakage",
            severity: "high",
            confidence: "high",
            category: "security",
            headSha: "abc",
          },
        ],
      },
      {
        provider: "style-reviewer",
        findings: [
          {
            file: "auth.ts",
            line: 12,
            message: "Use consistent quote style",
            headSha: "abc",
          },
        ],
      },
    ]);

    assert.equal(normalized.length, 2);
    assert.deepEqual(normalized[0].providers, ["security-reviewer"]);
    assert.equal(normalized[1].severity, "medium");
    assert.equal(normalized[1].confidence, "medium");
    assert.equal(normalized[1].category, "other");
  });
});

describe("adjudicateFindings", () => {
  it("merges duplicate findings and keeps the highest severity/confidence variant", () => {
    const findings: ReviewFinding[] = [
      {
        providers: ["style-reviewer"],
        file: "src/a.ts",
        line: 10,
        message: "Avoid magic numbers",
        severity: "low",
        confidence: "low",
        category: "style",
        headSha: "abc",
      },
      {
        providers: ["architecture-reviewer"],
        file: "src/a.ts",
        line: 10,
        message: "Avoid   magic numbers",
        severity: "medium",
        confidence: "high",
        category: "style",
        headSha: "abc",
      },
      {
        providers: ["security-reviewer"],
        file: "src/b.ts",
        line: 1,
        message: "Unsanitized input",
        severity: "critical",
        confidence: "high",
        category: "security",
        headSha: "abc",
      },
    ];

    const adjudicated = adjudicateFindings(findings);

    assert.equal(adjudicated.length, 2);
    assert.equal(adjudicated[0].file, "src/b.ts");
    assert.deepEqual(adjudicated[1].providers, ["architecture-reviewer", "style-reviewer"]);
    assert.equal(adjudicated[1].severity, "medium");
    assert.equal(adjudicated[1].confidence, "high");
  });
});

describe("filterCurrentFindings", () => {
  const findings: ReviewFinding[] = [
    {
      providers: ["style-reviewer"],
      file: "a.ts",
      line: 1,
      message: "style",
      severity: "low",
      confidence: "low",
      category: "style",
      headSha: "abc",
    },
    {
      providers: ["security-reviewer"],
      file: "b.ts",
      line: 2,
      message: "security",
      severity: "high",
      confidence: "high",
      category: "security",
      headSha: "abc",
    },
    {
      providers: ["architecture-reviewer"],
      file: "c.ts",
      line: 3,
      message: "old finding",
      severity: "critical",
      confidence: "high",
      category: "architecture",
      headSha: "old",
    },
    {
      providers: ["style-reviewer"],
      file: "d.ts",
      line: 4,
      message: "note",
      severity: "info",
      confidence: "medium",
      category: "style",
      headSha: "abc",
    },
  ];

  it("filters to current SHA in multi-reviewer mode and excludes info", () => {
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 5 };
    const result = filterCurrentFindings(findings, "abc", config);
    assert.equal(result.length, 2);
    assert.equal(result[0].providers[0], "security-reviewer");
    assert.ok(result.every((f) => f.headSha === "abc" && f.severity !== "info"));
  });

  it("keeps stale findings when skipStaleComments is false", () => {
    const config: RemediationConfig = { pinModel: true, skipStaleComments: false, maxAttempts: 5 };
    const result = filterCurrentFindings(findings, "abc", config);
    assert.equal(result.length, 3);
    assert.equal(result[0].headSha, "old");
  });
});

describe("runRemediationLoop", () => {
  it("applies fixes and validates", async () => {
    const findings: ReviewFinding[] = [
      {
        providers: ["security-reviewer"],
        file: "a.ts",
        line: 1,
        message: "err",
        severity: "high",
        confidence: "high",
        category: "security",
        headSha: "abc",
      },
    ];
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 5 };

    const result = await runRemediationLoop({
      findings,
      currentHeadSha: "abc",
      config,
      applyFix: async () => true,
      validate: async () => true,
    });

    assert.equal(result.attempted, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(result.errors.length, 0);
  });

  it("records errors on validation failure", async () => {
    const findings: ReviewFinding[] = [
      {
        providers: ["architecture-reviewer"],
        file: "a.ts",
        line: 1,
        message: "err",
        severity: "medium",
        confidence: "high",
        category: "architecture",
        headSha: "abc",
      },
    ];
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 5 };

    const result = await runRemediationLoop({
      findings,
      currentHeadSha: "abc",
      config,
      applyFix: async () => true,
      validate: async () => false,
    });

    assert.equal(result.attempted, 1);
    assert.equal(result.succeeded, 0);
    assert.equal(result.errors.length, 1);
  });

  it("respects maxAttempts after adjudication", async () => {
    const findings: ReviewFinding[] = [
      {
        providers: ["style-reviewer"],
        file: "a.ts",
        line: 1,
        message: "duplicate",
        severity: "low",
        confidence: "low",
        category: "style",
        headSha: "abc",
      },
      {
        providers: ["architecture-reviewer"],
        file: "a.ts",
        line: 1,
        message: "duplicate",
        severity: "high",
        confidence: "high",
        category: "style",
        headSha: "abc",
      },
      {
        providers: ["security-reviewer"],
        file: "b.ts",
        line: 2,
        message: "sql injection",
        severity: "critical",
        confidence: "high",
        category: "security",
        headSha: "abc",
      },
      {
        providers: ["security-reviewer"],
        file: "c.ts",
        line: 3,
        message: "old stale finding",
        severity: "critical",
        confidence: "high",
        category: "security",
        headSha: "old",
      },
    ];
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 1 };

    const targeted: string[] = [];
    const result = await runRemediationLoop({
      findings,
      currentHeadSha: "abc",
      config,
      applyFix: async (finding) => {
        targeted.push(`${finding.file}:${finding.line}`);
        return true;
      },
      validate: async () => true,
    });

    assert.equal(result.attempted, 1);
    assert.deepEqual(targeted, ["b.ts:2"]);
    assert.ok(result.errors.some((e) => e.includes("max remediation")));
  });
});
