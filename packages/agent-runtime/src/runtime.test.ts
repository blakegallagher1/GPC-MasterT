import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { TaskRunner } from "./runtime.js";
import type { TaskDefinition } from "./runtime.js";
import { GoalPlanner } from "./planner.js";
import { RetryPolicy } from "./retry-policy.js";
import { ExecutionMemoryStore } from "./memory-store.js";

const echoTask: TaskDefinition<string, string> = {
  name: "echo",
  description: "Returns the input string",
  execute: async (input, log) => {
    log("echoing input");
    return `echo: ${input}`;
  },
};

const failTask: TaskDefinition<void, void> = {
  name: "fail",
  description: "Always fails",
  execute: async () => {
    throw new Error("intentional failure");
  },
};

describe("TaskRunner", () => {
  it("registers and lists tasks", () => {
    const runner = new TaskRunner();
    runner.register(echoTask);
    assert.deepEqual(runner.listTasks(), ["echo"]);
  });

  it("runs a task to completion", async () => {
    const runner = new TaskRunner({ retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 }) });
    runner.register(echoTask);

    const id = await runner.submit("echo", "hello");
    await new Promise((r) => setTimeout(r, 50));

    const run = runner.getRun(id);
    assert.ok(run);
    assert.equal(run.status, "done");
    assert.equal(run.result, "echo: hello");
    assert.ok(run.logs.length > 0);
    assert.equal(run.logs[1].message, "echoing input");
  });

  it("captures failures", async () => {
    const runner = new TaskRunner({ retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 }) });
    runner.register(failTask);

    const id = await runner.submit("fail", undefined);
    await new Promise((r) => setTimeout(r, 50));

    const run = runner.getRun(id);
    assert.ok(run);
    assert.equal(run.status, "failed");
    assert.equal(run.error, "intentional failure");
  });

  it("throws on unknown task", async () => {
    const runner = new TaskRunner();
    await assert.rejects(() => runner.submit("nonexistent", {}), {
      message: "Unknown task: nonexistent",
    });
  });

  it("lists runs filtered by status", async () => {
    const runner = new TaskRunner({ retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 }) });
    runner.register(echoTask);
    runner.register(failTask);

    await runner.submit("echo", "a");
    await runner.submit("fail", undefined);
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(runner.listRuns("done").length, 1);
    assert.equal(runner.listRuns("failed").length, 1);
    assert.equal(runner.listRuns().length, 2);
  });

  it("creates explicit plans for high-level goals", async () => {
    const planner = new GoalPlanner();
    const runner = new TaskRunner({ planner, retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 }) });
    runner.register(echoTask);

    const runId = await runner.submit("echo", "value", { goal: "Implement endpoint. Add tests. Update docs." });
    await new Promise((r) => setTimeout(r, 50));

    const run = runner.getRun(runId);
    assert.ok(run?.plan);
    assert.equal(run.plan?.steps.length, 3);
    assert.ok(run.plan?.steps.every((step) => step.acceptanceChecks.length >= 2));
  });

  it("resumes queued runs after process restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-runtime-"));
    const stateFile = join(dir, "state.json");
    const runId = "resume-run-1";

    try {
      await writeFile(
        stateFile,
        JSON.stringify({
          runs: [
            {
              id: runId,
              taskName: "echo",
              status: "queued",
              logs: [],
              input: "restart",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              attempts: 0,
            },
          ],
        }),
        "utf8",
      );

      const runner = new TaskRunner({ stateFilePath: stateFile, retryPolicy: new RetryPolicy({ maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 }) });
      await runner.initialize();
      runner.register(echoTask);

      await new Promise((r) => setTimeout(r, 80));
      const run = runner.getRun(runId);
      assert.ok(run);
      assert.equal(run.status, "done");
      assert.equal(run.result, "echo: restart");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("RetryPolicy", () => {
  it("retries retryable failures with bounded attempts", async () => {
    let attempts = 0;
    const policy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 5 });

    const result = await policy.run(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("network timeout");
      }
      return "ok";
    });

    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  it("escalates after threshold of retryable failures", async () => {
    const policy = new RetryPolicy({ maxAttempts: 5, baseDelayMs: 0, maxDelayMs: 0, escalationThreshold: 2 });

    await assert.rejects(
      async () =>
        policy.run(async () => {
          throw new Error("temporary dependency failure");
        }),
      /Escalation threshold reached/,
    );
  });
});

describe("ExecutionMemoryStore", () => {
  it("retrieves most relevant scoped memories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agent-memory-"));
    const filePath = join(dir, "memory.jsonl");

    try {
      const store = new ExecutionMemoryStore(filePath);
      const now = new Date().toISOString();

      await store.save({
        id: "1",
        repo: "repo-a",
        pathScope: "packages/agent-runtime",
        kind: "remediation-pattern",
        content: "Fix flaky timeout by increasing retry delay",
        tags: ["retry", "timeout", "flaky"],
        createdAt: now,
      });

      await store.save({
        id: "2",
        repo: "repo-a",
        pathScope: "packages/config",
        kind: "failed-attempt",
        content: "Config schema mismatch",
        tags: ["schema"],
        createdAt: now,
      });

      const matches = await store.query({
        repo: "repo-a",
        pathScope: "packages/agent-runtime",
        text: "retry timeout remediation",
        limit: 1,
      });

      assert.equal(matches.length, 1);
      assert.equal(matches[0].id, "1");
      assert.equal(matches[0].kind, "remediation-pattern");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
