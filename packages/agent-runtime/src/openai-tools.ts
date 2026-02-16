/**
 * Repo tool adapters, safety policy, and agent runtime orchestration.
 */

import type {
  TaskClass,
  OpenAIClient,
  PlanningOutput,
  ReviewOutput,
  RemediationOutput,
} from "./openai-integration.js";
import { PromptRegistry, ModelRouter, parseStructuredOutput } from "./openai-integration.js";

export type RepoToolName = "git" | "tests" | "docs_checker" | "observability_query" | "browser_harness";

export interface GitInvocation {
  operation: "status" | "diff" | "commit" | "checkout";
  paths?: string[];
  message?: string;
}

export interface TestsInvocation {
  suite: "unit" | "integration" | "smoke";
  filter?: string;
}

export interface DocsCheckerInvocation {
  paths: string[];
}

export interface ObservabilityInvocation {
  query: string;
  windowMinutes: number;
}

export interface BrowserHarnessInvocation {
  url: string;
  action: "screenshot" | "run_script";
  script?: string;
}

export type RepoToolInvocationMap = {
  git: GitInvocation;
  tests: TestsInvocation;
  docs_checker: DocsCheckerInvocation;
  observability_query: ObservabilityInvocation;
  browser_harness: BrowserHarnessInvocation;
};

export type ToolResult = { tool: RepoToolName; ok: boolean; output: string };

export type ToolExecutorMap = {
  [K in RepoToolName]: (input: RepoToolInvocationMap[K]) => Promise<ToolResult>;
};

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function hasOnlyKeys(input: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(input).every((key) => new Set(keys).has(key));
}

function isGitInvocation(input: unknown): input is GitInvocation {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["operation", "paths", "message"]) &&
    ["status", "diff", "commit", "checkout"].includes(String(v.operation)) &&
    (v.paths === undefined || isStringArray(v.paths)) &&
    (v.message === undefined || typeof v.message === "string");
}

function isTestsInvocation(input: unknown): input is TestsInvocation {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["suite", "filter"]) &&
    ["unit", "integration", "smoke"].includes(String(v.suite)) &&
    (v.filter === undefined || typeof v.filter === "string");
}

function isDocsCheckerInvocation(input: unknown): input is DocsCheckerInvocation {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["paths"]) && isStringArray(v.paths);
}

function isObservabilityInvocation(input: unknown): input is ObservabilityInvocation {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["query", "windowMinutes"]) && typeof v.query === "string" && typeof v.windowMinutes === "number";
}

function isBrowserHarnessInvocation(input: unknown): input is BrowserHarnessInvocation {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["url", "action", "script"]) && typeof v.url === "string" &&
    (v.action === "screenshot" || v.action === "run_script") &&
    (v.script === undefined || typeof v.script === "string");
}

export class RepoToolAdapter {
  constructor(private readonly executors: ToolExecutorMap) {}

  async invoke<K extends RepoToolName>(tool: K, input: unknown): Promise<ToolResult> {
    switch (tool) {
      case "git":
        if (!isGitInvocation(input)) throw new Error("Invalid git tool invocation schema.");
        return this.executors.git(input);
      case "tests":
        if (!isTestsInvocation(input)) throw new Error("Invalid tests tool invocation schema.");
        return this.executors.tests(input);
      case "docs_checker":
        if (!isDocsCheckerInvocation(input)) throw new Error("Invalid docs checker invocation schema.");
        return this.executors.docs_checker(input);
      case "observability_query":
        if (!isObservabilityInvocation(input)) throw new Error("Invalid observability invocation schema.");
        return this.executors.observability_query(input);
      case "browser_harness":
        if (!isBrowserHarnessInvocation(input)) throw new Error("Invalid browser harness invocation schema.");
        return this.executors.browser_harness(input);
      default:
        throw new Error(`Unsupported tool: ${String(tool)}`);
    }
  }
}

export interface SafetyPolicyConfig {
  forbiddenOperations: RegExp[];
  secretPatterns: RegExp[];
  maxChangedLines: number;
  requiredSelfChecks: Array<"lint" | "test" | "build" | "security_scan">;
}

const DEFAULT_SAFETY_POLICY: SafetyPolicyConfig = {
  forbiddenOperations: [/rm\s+-rf\s+\//, /git\s+push\s+--force/, /curl\s+.*\|\s*sh/],
  secretPatterns: [/sk-[a-zA-Z0-9]{20,}/g, /ghp_[a-zA-Z0-9]{20,}/g, /AKIA[0-9A-Z]{16}/g],
  maxChangedLines: 800,
  requiredSelfChecks: ["lint", "test", "build", "security_scan"],
};

export class SafetyPolicyEngine {
  constructor(private readonly config: SafetyPolicyConfig = DEFAULT_SAFETY_POLICY) {}

  enforceOperation(command: string): void {
    if (this.config.forbiddenOperations.some((p) => p.test(command))) {
      throw new Error(`Forbidden operation blocked by policy: ${command}`);
    }
  }

  redactSecrets(text: string): string {
    return this.config.secretPatterns.reduce((acc, p) => acc.replace(p, "[REDACTED_SECRET]"), text);
  }

  enforceMaxChangeSize(changedLines: number): void {
    if (changedLines > this.config.maxChangedLines) {
      throw new Error(`Change size ${changedLines} exceeds max ${this.config.maxChangedLines}`);
    }
  }

  enforceSelfChecks(completedChecks: string[]): void {
    const missing = this.config.requiredSelfChecks.filter((c) => !completedChecks.includes(c));
    if (missing.length > 0) throw new Error(`Missing mandatory self-check stages: ${missing.join(", ")}`);
  }
}

export interface AgentTaskRequest { taskClass: TaskClass; userInput: string }

export interface AgentTaskResponse {
  taskClass: TaskClass;
  model: string;
  promptId: string;
  promptVersion: string;
  output: string | PlanningOutput | ReviewOutput | RemediationOutput;
}

export class OpenAIAgentRuntime {
  constructor(
    private readonly openAIClient: OpenAIClient,
    private readonly promptRegistry: PromptRegistry,
    private readonly modelRouter = new ModelRouter(),
  ) {}

  async run(request: AgentTaskRequest): Promise<AgentTaskResponse> {
    const route = this.modelRouter.resolve(request.taskClass);
    const mapping = this.promptRegistry.resolve(request.taskClass);
    const prompt = await this.promptRegistry.loadPrompt(mapping.prompt);
    const response = await this.openAIClient.createResponse({
      model: route.model, temperature: route.temperature,
      messages: [{ role: "system", content: prompt.content }, { role: "user", content: request.userInput }],
    });
    const output = this.parseByTaskClass(request.taskClass, response.outputText);
    return { taskClass: request.taskClass, model: route.model, promptId: prompt.id, promptVersion: prompt.version, output };
  }

  private parseByTaskClass(
    taskClass: TaskClass, outputText: string,
  ): string | PlanningOutput | ReviewOutput | RemediationOutput {
    switch (taskClass) {
      case "planning": return parseStructuredOutput(outputText, isPlanningOutput, "planning");
      case "review": return parseStructuredOutput(outputText, isReviewOutput, "review");
      case "remediation": return parseStructuredOutput(outputText, isRemediationOutput, "remediation");
      case "code_edit":
      case "summarization": return outputText;
      default: throw new Error(`Unsupported task class: ${String(taskClass)}`);
    }
  }
}

function isPlanningOutput(input: unknown): input is PlanningOutput {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  if (!hasOnlyKeys(v, ["objectives", "risks", "plan"])) return false;
  if (!isStringArray(v.objectives) || !isStringArray(v.risks) || !Array.isArray(v.plan)) return false;
  return v.plan.every((step) => {
    if (!step || typeof step !== "object") return false;
    const r = step as Record<string, unknown>;
    return hasOnlyKeys(r, ["step", "owner", "doneDefinition"]) &&
      typeof r.step === "string" && (r.owner === "agent" || r.owner === "human") && typeof r.doneDefinition === "string";
  });
}

function isReviewOutput(input: unknown): input is ReviewOutput {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  if (!hasOnlyKeys(v, ["summary", "findings", "recommendation"])) return false;
  if (typeof v.summary !== "string" || !Array.isArray(v.findings)) return false;
  if (v.recommendation !== "approve" && v.recommendation !== "request_changes") return false;
  return v.findings.every((f) => {
    if (!f || typeof f !== "object") return false;
    const r = f as Record<string, unknown>;
    return hasOnlyKeys(r, ["severity", "file", "detail"]) &&
      (r.severity === "low" || r.severity === "medium" || r.severity === "high") &&
      typeof r.file === "string" && typeof r.detail === "string";
  });
}

function isRemediationOutput(input: unknown): input is RemediationOutput {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  return hasOnlyKeys(v, ["issue", "patchPlan", "validation"]) &&
    typeof v.issue === "string" && isStringArray(v.patchPlan) && isStringArray(v.validation);
}
