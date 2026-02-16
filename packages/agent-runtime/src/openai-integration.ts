import { readFile } from "node:fs/promises";
import path from "node:path";

export type TaskClass = "planning" | "code_edit" | "review" | "summarization" | "remediation";

export interface ModelRoute {
  model: string;
  temperature: number;
}

export type ModelRouteTable = Record<TaskClass, ModelRoute>;

const DEFAULT_MODEL_ROUTES: ModelRouteTable = {
  planning: { model: "gpt-5.2-mini", temperature: 0 },
  code_edit: { model: "gpt-5.2", temperature: 0 },
  review: { model: "gpt-5.2", temperature: 0 },
  summarization: { model: "gpt-5.2-mini", temperature: 0.1 },
  remediation: { model: "gpt-5.2", temperature: 0 },
};

export class ModelRouter {
  constructor(private readonly routeTable: ModelRouteTable = DEFAULT_MODEL_ROUTES) {}

  resolve(taskClass: TaskClass): ModelRoute {
    return this.routeTable[taskClass];
  }
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIRequest {
  model: string;
  temperature: number;
  messages: OpenAIMessage[];
}

export interface OpenAIResponse {
  outputText: string;
}

export interface OpenAIClient {
  createResponse(request: OpenAIRequest): Promise<OpenAIResponse>;
}

export class FetchOpenAIClient implements OpenAIClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async createResponse(request: OpenAIRequest): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,
        input: request.messages.map((message) => ({
          role: message.role,
          content: [{ type: "input_text", text: message.content }],
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API call failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    const fallbackText = payload.output?.flatMap((entry) => entry.content ?? []).map((content) => content.text ?? "").join("\n");
    return { outputText: payload.output_text ?? fallbackText ?? "" };
  }
}

export interface PromptVersionRef {
  id: string;
  version: string;
}

export interface PromptMapping {
  taskClass: TaskClass;
  prompt: PromptVersionRef;
  rollbackVersion: string;
}

export interface PromptRegistryDocument {
  mappings: PromptMapping[];
}

export interface PromptRecord {
  id: string;
  version: string;
  content: string;
}

export class PromptRegistry {
  constructor(private readonly rootDir: string, private readonly document: PromptRegistryDocument) {}

  static async loadFromRepo(rootDir: string): Promise<PromptRegistry> {
    const registryPath = path.join(rootDir, "docs/prompts/registry.json");
    const raw = await readFile(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as PromptRegistryDocument;
    return new PromptRegistry(rootDir, parsed);
  }

  resolve(taskClass: TaskClass): PromptMapping {
    const mapping = this.document.mappings.find((entry) => entry.taskClass === taskClass);
    if (!mapping) {
      throw new Error(`No prompt mapping configured for task class: ${taskClass}`);
    }
    return mapping;
  }

  async loadPrompt(ref: PromptVersionRef): Promise<PromptRecord> {
    const promptPath = path.join(this.rootDir, "docs/prompts", ref.id, `${ref.version}.md`);
    const content = await readFile(promptPath, "utf-8");
    return { id: ref.id, version: ref.version, content };
  }
}

export interface PlanningOutput {
  objectives: string[];
  risks: string[];
  plan: Array<{ step: string; owner: "agent" | "human"; doneDefinition: string }>;
}

export interface ReviewOutput {
  summary: string;
  findings: Array<{ severity: "low" | "medium" | "high"; file: string; detail: string }>;
  recommendation: "approve" | "request_changes";
}

export interface RemediationOutput {
  issue: string;
  patchPlan: string[];
  validation: string[];
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function hasOnlyKeys(input: Record<string, unknown>, keys: string[]): boolean {
  const valid = new Set(keys);
  return Object.keys(input).every((key) => valid.has(key));
}

function isPlanningOutput(input: unknown): input is PlanningOutput {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  if (!hasOnlyKeys(value, ["objectives", "risks", "plan"])) {
    return false;
  }
  if (!isStringArray(value.objectives) || !isStringArray(value.risks) || !Array.isArray(value.plan)) {
    return false;
  }
  return value.plan.every((step) => {
    if (!step || typeof step !== "object") {
      return false;
    }
    const record = step as Record<string, unknown>;
    return (
      hasOnlyKeys(record, ["step", "owner", "doneDefinition"]) &&
      typeof record.step === "string" &&
      (record.owner === "agent" || record.owner === "human") &&
      typeof record.doneDefinition === "string"
    );
  });
}

function isReviewOutput(input: unknown): input is ReviewOutput {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  if (!hasOnlyKeys(value, ["summary", "findings", "recommendation"])) {
    return false;
  }
  if (typeof value.summary !== "string" || !Array.isArray(value.findings)) {
    return false;
  }
  if (value.recommendation !== "approve" && value.recommendation !== "request_changes") {
    return false;
  }
  return value.findings.every((finding) => {
    if (!finding || typeof finding !== "object") {
      return false;
    }
    const record = finding as Record<string, unknown>;
    return (
      hasOnlyKeys(record, ["severity", "file", "detail"]) &&
      (record.severity === "low" || record.severity === "medium" || record.severity === "high") &&
      typeof record.file === "string" &&
      typeof record.detail === "string"
    );
  });
}

function isRemediationOutput(input: unknown): input is RemediationOutput {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  return (
    hasOnlyKeys(value, ["issue", "patchPlan", "validation"]) &&
    typeof value.issue === "string" &&
    isStringArray(value.patchPlan) &&
    isStringArray(value.validation)
  );
}

export function parseStructuredOutput<T>(raw: string, validator: (input: unknown) => input is T, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${label} response: expected JSON object.`);
  }
  if (!validator(parsed)) {
    throw new Error(`Invalid ${label} response: schema validation failed.`);
  }
  return parsed;
}

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

export type ToolResult = {
  tool: RepoToolName;
  ok: boolean;
  output: string;
};

export type ToolExecutorMap = {
  [K in RepoToolName]: (input: RepoToolInvocationMap[K]) => Promise<ToolResult>;
};

function isGitInvocation(input: unknown): input is GitInvocation {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  if (!hasOnlyKeys(value, ["operation", "paths", "message"])) {
    return false;
  }
  if (!["status", "diff", "commit", "checkout"].includes(String(value.operation))) {
    return false;
  }
  if (value.paths !== undefined && !isStringArray(value.paths)) {
    return false;
  }
  if (value.message !== undefined && typeof value.message !== "string") {
    return false;
  }
  return true;
}

function isTestsInvocation(input: unknown): input is TestsInvocation {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  return (
    hasOnlyKeys(value, ["suite", "filter"]) &&
    ["unit", "integration", "smoke"].includes(String(value.suite)) &&
    (value.filter === undefined || typeof value.filter === "string")
  );
}

function isDocsCheckerInvocation(input: unknown): input is DocsCheckerInvocation {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  return hasOnlyKeys(value, ["paths"]) && isStringArray(value.paths);
}

function isObservabilityInvocation(input: unknown): input is ObservabilityInvocation {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  return (
    hasOnlyKeys(value, ["query", "windowMinutes"]) &&
    typeof value.query === "string" &&
    typeof value.windowMinutes === "number"
  );
}

function isBrowserHarnessInvocation(input: unknown): input is BrowserHarnessInvocation {
  if (!input || typeof input !== "object") {
    return false;
  }
  const value = input as Record<string, unknown>;
  return (
    hasOnlyKeys(value, ["url", "action", "script"]) &&
    typeof value.url === "string" &&
    (value.action === "screenshot" || value.action === "run_script") &&
    (value.script === undefined || typeof value.script === "string")
  );
}

export class RepoToolAdapter {
  constructor(private readonly executors: ToolExecutorMap) {}

  async invoke<K extends RepoToolName>(tool: K, input: unknown): Promise<ToolResult> {
    switch (tool) {
      case "git":
        if (!isGitInvocation(input)) {
          throw new Error("Invalid git tool invocation schema.");
        }
        return this.executors.git(input);
      case "tests":
        if (!isTestsInvocation(input)) {
          throw new Error("Invalid tests tool invocation schema.");
        }
        return this.executors.tests(input);
      case "docs_checker":
        if (!isDocsCheckerInvocation(input)) {
          throw new Error("Invalid docs checker invocation schema.");
        }
        return this.executors.docs_checker(input);
      case "observability_query":
        if (!isObservabilityInvocation(input)) {
          throw new Error("Invalid observability invocation schema.");
        }
        return this.executors.observability_query(input);
      case "browser_harness":
        if (!isBrowserHarnessInvocation(input)) {
          throw new Error("Invalid browser harness invocation schema.");
        }
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
    if (this.config.forbiddenOperations.some((pattern) => pattern.test(command))) {
      throw new Error(`Forbidden operation blocked by policy: ${command}`);
    }
  }

  redactSecrets(text: string): string {
    return this.config.secretPatterns.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED_SECRET]"), text);
  }

  enforceMaxChangeSize(changedLines: number): void {
    if (changedLines > this.config.maxChangedLines) {
      throw new Error(`Change size ${changedLines} exceeds max ${this.config.maxChangedLines}`);
    }
  }

  enforceSelfChecks(completedChecks: string[]): void {
    const missing = this.config.requiredSelfChecks.filter((check) => !completedChecks.includes(check));
    if (missing.length > 0) {
      throw new Error(`Missing mandatory self-check stages: ${missing.join(", ")}`);
    }
  }
}

export interface AgentTaskRequest {
  taskClass: TaskClass;
  userInput: string;
}

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
      model: route.model,
      temperature: route.temperature,
      messages: [
        { role: "system", content: prompt.content },
        { role: "user", content: request.userInput },
      ],
    });

    const output = this.parseByTaskClass(request.taskClass, response.outputText);
    return {
      taskClass: request.taskClass,
      model: route.model,
      promptId: prompt.id,
      promptVersion: prompt.version,
      output,
    };
  }

  private parseByTaskClass(taskClass: TaskClass, outputText: string): string | PlanningOutput | ReviewOutput | RemediationOutput {
    switch (taskClass) {
      case "planning":
        return parseStructuredOutput(outputText, isPlanningOutput, "planning");
      case "review":
        return parseStructuredOutput(outputText, isReviewOutput, "review");
      case "remediation":
        return parseStructuredOutput(outputText, isRemediationOutput, "remediation");
      case "code_edit":
      case "summarization":
        return outputText;
      default:
        throw new Error(`Unsupported task class: ${String(taskClass)}`);
    }
  }
}
