import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TaskRunner } from "./runtime.js";
import type { TaskDefinition } from "./runtime.js";

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
    const runner = new TaskRunner();
    runner.register(echoTask);

    const id = await runner.submit("echo", "hello");
    // Allow microtask to complete
    await new Promise((r) => setTimeout(r, 50));

    const run = runner.getRun(id);
    assert.ok(run);
    assert.equal(run.status, "done");
    assert.equal(run.result, "echo: hello");
    assert.ok(run.logs.length > 0);
    assert.equal(run.logs[0].message, "echoing input");
  });

  it("captures failures", async () => {
    const runner = new TaskRunner();
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
    const runner = new TaskRunner();
    runner.register(echoTask);
    runner.register(failTask);

    await runner.submit("echo", "a");
    await runner.submit("fail", undefined);
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(runner.listRuns("done").length, 1);
    assert.equal(runner.listRuns("failed").length, 1);
    assert.equal(runner.listRuns().length, 2);
  });
});
