import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExecutionPlan, GoalPlanner } from "./planner.js";
import { RetryPolicy, type RetryAttemptState } from "./retry-policy.js";
import type { ExecutionMemoryStore, MemoryKind } from "./memory-store.js";
import { trace } from "@opentelemetry/api";
import { emitStructuredLog, markSpanError, markSpanOk, runtimeTelemetry } from "./observability.js";

/** Possible statuses a task can be in. */
export type TaskStatus = "queued" | "running" | "done" | "failed";

/** Structured log entry emitted during task execution. */
export interface TaskLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface TaskExecutionContext {
  attempt: number;
  runId: string;
  logRetryState: (state: RetryAttemptState) => void;
}

/** Definition of an executable agent task. */
export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique name identifying this task type. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Execute the task. Receives input and a logger, returns output. */
  execute: (
    input: TInput,
    log: (msg: string, level?: TaskLogEntry["level"]) => void,
    context: TaskExecutionContext,
  ) => Promise<TOutput>;
}

/** A task instance with status and result tracking. */
export interface TaskRun<TInput = unknown, TOutput = unknown> {
  id: string;
  taskName: string;
  status: TaskStatus;
  logs: TaskLogEntry[];
  input: TInput;
  result?: TOutput;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  attempts: number;
  plan?: ExecutionPlan;
}

export interface TaskSubmitOptions {
  goal?: string;
}

export interface TaskRunnerOptions {
  stateFilePath?: string;
  retryPolicy?: RetryPolicy;
  planner?: GoalPlanner;
  memoryStore?: ExecutionMemoryStore;
  repoId?: string;
  pathScope?: string;
}

const runtimeTracer = trace.getTracer("gpc.agent-runtime", "0.1.0");

/**
 * Registry of available task definitions and their run history.
 */
export class TaskRunner {
  private definitions = new Map<string, TaskDefinition>();
  private runs = new Map<string, TaskRun>();
  private readonly retryPolicy: RetryPolicy;
  private readonly stateFilePath?: string;
  private readonly planner?: GoalPlanner;
  private readonly memoryStore?: ExecutionMemoryStore;
  private readonly repoId: string;
  private readonly pathScope: string;

  constructor(options?: TaskRunnerOptions) {
    this.stateFilePath = options?.stateFilePath;
    this.retryPolicy = options?.retryPolicy ?? new RetryPolicy();
    this.planner = options?.planner;
    this.memoryStore = options?.memoryStore;
    this.repoId = options?.repoId ?? "unknown-repo";
    this.pathScope = options?.pathScope ?? "/";
  }

  async initialize(): Promise<void> {
    await this.loadState();
    await this.resumePendingRuns();
  }

  /** Register a task definition. */
  register<TInput, TOutput>(def: TaskDefinition<TInput, TOutput>): void {
    this.definitions.set(def.name, def as TaskDefinition);
    void this.resumePendingRuns();
  }

  /** List all registered task names. */
  listTasks(): string[] {
    return Array.from(this.definitions.keys());
  }

  /** Get a task definition by name. */
  getDefinition(name: string): TaskDefinition | undefined {
    return this.definitions.get(name);
  }

  /** Submit a task for execution. Returns the run ID immediately. */
  async submit<TInput>(taskName: string, input: TInput, options?: TaskSubmitOptions): Promise<string> {
    const def = this.definitions.get(taskName);
    if (!def) {
      throw new Error(`Unknown task: ${taskName}`);
    }

    const now = new Date().toISOString();
    const run: TaskRun<TInput> = {
      id: randomUUID(),
      taskName,
      status: "queued",
      logs: [],
      input,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      plan: options?.goal && this.planner ? this.planner.decompose(options.goal) : undefined,
    };
    this.runs.set(run.id, run as TaskRun);
    await this.persistState();

    // Execute asynchronously
    void this.executeRun(run as TaskRun, def, input);

    return run.id;
  }

  /** Get the current state of a task run. */
  getRun(id: string): TaskRun | undefined {
    return this.runs.get(id);
  }

  /** List all runs, optionally filtered by status. */
  listRuns(status?: TaskStatus): TaskRun[] {
    const all = Array.from(this.runs.values());
    return status ? all.filter((r) => r.status === status) : all;
  }

  private async executeRun(run: TaskRun, def: TaskDefinition, input: unknown): Promise<void> {
    const start = process.hrtime.bigint();
    run.status = "running";
    run.startedAt ??= new Date().toISOString();
    run.updatedAt = new Date().toISOString();
    await this.persistState();

    runtimeTelemetry.taskRunsTotal.add(1, { task_name: run.taskName });

    const logRetryState = (state: RetryAttemptState) => {
      if (state.failureClass) {
        log(
          `Attempt ${state.attempt} failed with ${state.failureClass}${state.error ? `: ${state.error}` : ""}`,
          state.failureClass === "retryable" ? "warn" : "error",
        );
      } else {
        log(`Starting attempt ${state.attempt}`, "debug");
      }
    };

    try {
      const result = await this.retryPolicy.run(
        async (state) => {
          run.attempts = state.attempt;
          run.updatedAt = new Date().toISOString();
          await this.persistState();
          return def.execute(input, log, { attempt: state.attempt, runId: run.id, logRetryState });
        },
        (state) => {
          logRetryState(state);
        },
      );
      run.result = result;
      run.status = "done";
      await this.writeMemory("remediation-pattern", `Task ${run.taskName} completed`, run, {
        attempts: run.attempts,
      });
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
      run.status = "failed";
      runtimeTelemetry.taskErrorsTotal.add(1, { task_name: run.taskName });
      await this.writeMemory("failed-attempt", `Task ${run.taskName} failed: ${run.error}`, run, {
        attempts: run.attempts,
      });
    } finally {
      run.completedAt = new Date().toISOString();
      run.updatedAt = run.completedAt;
      await this.persistState();
    }
  }

  private async writeMemory(kind: MemoryKind, content: string, run: TaskRun, metadata: Record<string, unknown>): Promise<void> {
    if (!this.memoryStore) return;
    await this.memoryStore.save({
      id: randomUUID(),
      repo: this.repoId,
      pathScope: this.pathScope,
      kind,
      content,
      tags: [run.taskName, run.status],
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  private async resumePendingRuns(): Promise<void> {
    const resumable = Array.from(this.runs.values()).filter((run) => run.status === "queued" || run.status === "running");
    for (const run of resumable) {
      const def = this.definitions.get(run.taskName);
      if (!def) continue;
      void this.executeRun(run, def, run.input);
    }
  }

  private async persistState(): Promise<void> {
    if (!this.stateFilePath) return;
    await mkdir(dirname(this.stateFilePath), { recursive: true });
    const data = JSON.stringify({ runs: Array.from(this.runs.values()) }, null, 2);
    await writeFile(this.stateFilePath, data, "utf8");
  }

  private async loadState(): Promise<void> {
    if (!this.stateFilePath) return;
    try {
      const raw = await readFile(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as { runs?: TaskRun[] };
      for (const run of parsed.runs ?? []) {
        this.runs.set(run.id, run);
      }
    } catch {
      // no-op when state file is absent or malformed
    }
  }
}
