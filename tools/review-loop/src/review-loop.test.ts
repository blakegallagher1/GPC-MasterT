import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  findAutoResolvableThreads,
  autoResolveBotThreads,
} from "./auto-resolve.js";
import {
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

describe("filterCurrentFindings", () => {
  const findings: ReviewFinding[] = [
    { file: "a.ts", line: 1, message: "err", severity: "error", headSha: "abc" },
    { file: "b.ts", line: 2, message: "warn", severity: "warning", headSha: "abc" },
    { file: "c.ts", line: 3, message: "old", severity: "error", headSha: "old" },
    { file: "d.ts", line: 4, message: "note", severity: "info", headSha: "abc" },
  ];

  it("filters to current SHA and excludes info", () => {
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 5 };
    const result = filterCurrentFindings(findings, "abc", config);
    assert.equal(result.length, 2);
    assert.ok(result.every((f) => f.headSha === "abc" && f.severity !== "info"));
  });

  it("keeps stale when skipStaleComments is false", () => {
    const config: RemediationConfig = { pinModel: true, skipStaleComments: false, maxAttempts: 5 };
    const result = filterCurrentFindings(findings, "abc", config);
    assert.equal(result.length, 3); // all non-info
  });
});

describe("runRemediationLoop", () => {
  it("applies fixes and validates", async () => {
    const findings: ReviewFinding[] = [
      { file: "a.ts", line: 1, message: "err", severity: "error", headSha: "abc" },
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
      { file: "a.ts", line: 1, message: "err", severity: "error", headSha: "abc" },
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

  it("respects maxAttempts", async () => {
    const findings: ReviewFinding[] = [
      { file: "a.ts", line: 1, message: "e1", severity: "error", headSha: "abc" },
      { file: "b.ts", line: 2, message: "e2", severity: "error", headSha: "abc" },
      { file: "c.ts", line: 3, message: "e3", severity: "error", headSha: "abc" },
    ];
    const config: RemediationConfig = { pinModel: true, skipStaleComments: true, maxAttempts: 2 };

    const result = await runRemediationLoop({
      findings,
      currentHeadSha: "abc",
      config,
      applyFix: async () => true,
      validate: async () => true,
    });

    assert.equal(result.attempted, 2);
    assert.ok(result.errors.some((e) => e.includes("max remediation")));
  });
});
