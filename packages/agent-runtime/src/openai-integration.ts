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

