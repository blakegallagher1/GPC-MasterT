import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  validateStructure,
  discoverSkills,
  executeEvalRun,
  runEvalSuite,
  parseObsArgs,
  type EvalSuite,
} from "./cli.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseArgs", () => {
  it("extracts command from argv", () => {
    const result = parseArgs(["node", "gpc", "validate"]);
    assert.equal(result.command, "validate");
  });

  it("defaults to help when no command given", () => {
    const result = parseArgs(["node", "gpc"]);
    assert.equal(result.command, "help");
  });

  it("normalizes eval run command", () => {
    const result = parseArgs(["node", "gpc", "eval", "run", "--suite", "tests/evals/suites/core.json"]);
    assert.equal(result.command, "eval:run");
    assert.deepEqual(result.args, ["--suite", "tests/evals/suites/core.json"]);
  });
});

describe("validateStructure", () => {
  it("reports missing paths in an empty directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const result = validateStructure(tmp);
      assert.equal(result.valid, false);
      assert.ok(result.missing.length > 0);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

describe("discoverSkills", () => {
  it("finds skills with SKILL.md files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const skillsDir = join(tmp, "skills", "my-skill");
      mkdirSync(skillsDir, { recursive: true });
      writeFileSync(join(skillsDir, "SKILL.md"), "# My Skill\nDoes things.");
      const skills = discoverSkills(tmp);
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "my-skill");
      assert.equal(skills[0].description, "My Skill");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  it("returns empty array when no skills directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const skills = discoverSkills(tmp);
      assert.deepEqual(skills, []);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

describe("eval runner", () => {
  it("computes required metrics from benchmark tasks", () => {
    const suite: EvalSuite = {
      suite: "unit-fixture",
      tasks: [
        {
          id: "bug-fix-1",
          category: "bug-fix",
          prompt: "Fix flaky scheduler boundary check.",
          attempts: [
            { success: false, durationMs: 400, policyViolations: 1, regressionDelta: -0.03 },
            { success: true, durationMs: 280, policyViolations: 0, regressionDelta: 0.02 },
          ],
        },
        {
          id: "docs-1",
          category: "docs-update",
          prompt: "Update API runbook with troubleshooting notes.",
          attempts: [{ success: true, durationMs: 120, policyViolations: 0, regressionDelta: 0.01 }],
        },
      ],
    };

    const report = runEvalSuite(suite);
    assert.equal(report.metrics.passRate, 1);
    assert.equal(report.metrics.retriesToSuccess, 0.5);
    assert.equal(report.metrics.policyViolations, 1);
    assert.equal(report.metrics.meanTaskDurationMs, 200);
    assert.equal(report.metrics.regressionDelta, 0.015);
  });

  it("writes machine-readable report output to disk", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-eval-"));
    try {
      const suitePath = join(tmp, "tests", "evals", "suites", "core.json");
      const reportPath = "artifacts/eval/report.json";
      mkdirSync(join(tmp, "tests", "evals", "suites"), { recursive: true });
      writeFileSync(
        suitePath,
        JSON.stringify({
          suite: "fixture",
          tasks: [
            {
              id: "policy-1",
              category: "policy-compliance",
              prompt: "Ensure policy checks pass.",
              attempts: [{ success: true, durationMs: 100, policyViolations: 0, regressionDelta: 0 }],
            },
          ],
        }),
      );

      executeEvalRun(tmp, ["--suite", "tests/evals/suites/core.json", "--out", reportPath]);
      const written = JSON.parse(readFileSync(join(tmp, reportPath), "utf-8"));
      assert.equal(written.suite, "fixture");
      assert.equal(written.metrics.passRate, 1);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

describe("parseObsArgs", () => {
  it("parses obs query options", () => {
    const result = parseObsArgs(["query", "--type=metrics", "--query=up"]);
    assert.equal(result.type, "metrics");
    assert.equal(result.query, "up");
  });

  it("throws on unknown type", () => {
    assert.throws(() => parseObsArgs(["query", "--type=unknown"]));
  });
});
