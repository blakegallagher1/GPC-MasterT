import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  ModelRouter,
  PromptRegistry,
  parseStructuredOutput,
} from "./openai-integration.js";
import {
  OpenAIAgentRuntime,
  RepoToolAdapter,
  SafetyPolicyEngine,
} from "./openai-tools.js";
import type { OpenAIClient, OpenAIRequest, OpenAIResponse } from "./openai-integration.js";
import type { ToolExecutorMap } from "./openai-tools.js";

class DeterministicOpenAIClient implements OpenAIClient {
  private readonly fixtures = new Map<string, string>([
    [
      "planning::v1",
      JSON.stringify({
        objectives: ["Ship model routing layer"],
        risks: ["Prompt mismatch"],
        plan: [{ step: "Implement runtime", owner: "agent", doneDefinition: "Tests pass" }],
      }),
    ],
    [
      "review::v1",
      JSON.stringify({
        summary: "Looks good with one issue",
        findings: [{ severity: "medium", file: "runtime.ts", detail: "Missing guard" }],
        recommendation: "request_changes",
      }),
    ],
    [
      "remediation::v1",
      JSON.stringify({
        issue: "Missing guard",
        patchPlan: ["Add null check", "Expand tests"],
        validation: ["pnpm --filter @gpc/agent-runtime test"],
      }),
    ],
    ["summarization::v1", "Deterministic summary output"],
  ]);

  async createResponse(request: OpenAIRequest): Promise<OpenAIResponse> {
    const systemPrompt = request.messages[0]?.content ?? "";
    const taskClass = systemPrompt.includes("planning")
      ? "planning"
      : systemPrompt.includes("review")
        ? "review"
        : systemPrompt.includes("remediation")
          ? "remediation"
          : "summarization";
    const key = `${taskClass}::v1`;
    const outputText = this.fixtures.get(key);
    if (!outputText) {
      throw new Error(`No deterministic fixture for ${key}`);
    }
    return { outputText };
  }
}

describe("model routing", () => {
  it("routes by task class", () => {
    const router = new ModelRouter();
    assert.equal(router.resolve("planning").model, "gpt-5.2-mini");
    assert.equal(router.resolve("code_edit").model, "gpt-5.2");
    assert.equal(router.resolve("review").model, "gpt-5.2");
    assert.equal(router.resolve("summarization").model, "gpt-5.2-mini");
  });
});

describe("structured outputs", () => {
  it("rejects malformed planning objects", () => {
    assert.throws(
      () =>
        parseStructuredOutput(
          "{\"objectives\":[]}",
          (x): x is { expected: string } => typeof (x as { expected?: unknown }).expected === "string",
          "planning",
        ),
      /schema validation failed/,
    );
  });
});

describe("tool adapters", () => {
  it("enforces strict schemas before invocation", async () => {
    const executors: ToolExecutorMap = {
      git: async () => ({ tool: "git", ok: true, output: "clean" }),
      tests: async () => ({ tool: "tests", ok: true, output: "pass" }),
      docs_checker: async () => ({ tool: "docs_checker", ok: true, output: "in sync" }),
      observability_query: async () => ({ tool: "observability_query", ok: true, output: "healthy" }),
      browser_harness: async () => ({ tool: "browser_harness", ok: true, output: "screenshot.png" }),
    };

    const adapter = new RepoToolAdapter(executors);
    const gitResult = await adapter.invoke("git", { operation: "status" });
    assert.equal(gitResult.ok, true);

    await assert.rejects(() => adapter.invoke("tests", { suite: "unit", unexpected: true }), /Invalid tests tool invocation schema/);
  });
});

describe("safety policy", () => {
  it("blocks forbidden operations and enforces self-checks", () => {
    const policy = new SafetyPolicyEngine();
    assert.throws(() => policy.enforceOperation("rm -rf /"), /Forbidden operation/);
    assert.throws(() => policy.enforceSelfChecks(["lint", "test"]), /Missing mandatory self-check stages/);
    assert.equal(policy.redactSecrets("token sk-12345678901234567890"), "token [REDACTED_SECRET]");
  });
});

describe("deterministic replay", () => {
  it("replays representative tasks with pinned prompt versions", async () => {
    const rootDir = path.resolve(process.cwd(), "../..");
    const promptRegistry = await PromptRegistry.loadFromRepo(rootDir);
    const runtime = new OpenAIAgentRuntime(new DeterministicOpenAIClient(), promptRegistry);

    const planning = await runtime.run({ taskClass: "planning", userInput: "Plan this change" });
    const review = await runtime.run({ taskClass: "review", userInput: "Review patch" });
    const remediation = await runtime.run({ taskClass: "remediation", userInput: "Remediate issue" });
    const summary = await runtime.run({ taskClass: "summarization", userInput: "Summarize release" });

    assert.equal(planning.promptVersion, "v1");
    assert.equal(review.promptVersion, "v1");
    assert.equal(remediation.promptVersion, "v1");
    assert.equal(summary.promptVersion, "v1");

    assert.deepEqual(planning.output, {
      objectives: ["Ship model routing layer"],
      risks: ["Prompt mismatch"],
      plan: [{ step: "Implement runtime", owner: "agent", doneDefinition: "Tests pass" }],
    });
    assert.equal(typeof summary.output, "string");
  });
});
