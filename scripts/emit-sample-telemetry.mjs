import { TaskRunner, initOpenTelemetry, shutdownOpenTelemetry } from "../packages/agent-runtime/dist/index.js";

await initOpenTelemetry("gpc-telemetry-smoke");

const runner = new TaskRunner();
runner.register({
  name: "sample",
  description: "sample task",
  execute: async (_input, log) => {
    log("sample task started");
    await new Promise((resolve) => setTimeout(resolve, 100));
    log("sample task finished");
    return { ok: true };
  },
});

const runId = await runner.submit("sample", { seed: 1 });
await new Promise((resolve) => setTimeout(resolve, 1800));

const run = runner.getRun(runId);
if (!run || run.status !== "done") {
  throw new Error("sample task did not complete successfully");
}

await shutdownOpenTelemetry();
