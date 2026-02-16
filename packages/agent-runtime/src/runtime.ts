import { randomUUID } from "node:crypto";

/** Possible statuses a task can be in. */
export type TaskStatus = "queued" | "running" | "done" | "failed";

/** Structured log entry emitted during task execution. */
export interface TaskLogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

/** Definition of an executable agent task. */
export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique name identifying this task type. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Execute the task. Receives input and a logger, returns output. */
  execute: (input: TInput, log: (msg: string, level?: TaskLogEntry["level"]) => void) => Promise<TOutput>;
}

/** A task instance with status and result tracking. */
export interface TaskRun<TOutput = unknown> {
  id: string;
  taskName: string;
  status: TaskStatus;
  logs: TaskLogEntry[];
  result?: TOutput;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Registry of available task definitions and their run history.
 */
export class TaskRunner {
  private definitions = new Map<string, TaskDefinition>();
  private runs = new Map<string, TaskRun>();

  /** Register a task definition. */
  register<TInput, TOutput>(def: TaskDefinition<TInput, TOutput>): void {
    this.definitions.set(def.name, def as TaskDefinition);
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
  async submit<TInput>(taskName: string, input: TInput): Promise<string> {
    const def = this.definitions.get(taskName);
    if (!def) {
      throw new Error(`Unknown task: ${taskName}`);
    }

    const now = new Date().toISOString();
    const run: TaskRun = {
      id: randomUUID(),
      taskName,
      status: "queued",
      logs: [],
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);

    // Execute asynchronously
    this.executeRun(run, def, input);

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
    run.status = "running";
    run.updatedAt = new Date().toISOString();

    const log = (message: string, level: TaskLogEntry["level"] = "info") => {
      run.logs.push({ timestamp: new Date().toISOString(), level, message });
    };

    try {
      const result = await def.execute(input, log);
      run.result = result;
      run.status = "done";
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
      run.status = "failed";
    } finally {
      run.updatedAt = new Date().toISOString();
    }
  }
}
