export type FailureClass = "retryable" | "permanent" | "escalate";

export interface RetryPolicyOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier?: number;
  escalationThreshold: number;
  classifyFailure?: (error: unknown) => FailureClass;
}

export interface RetryAttemptState {
  attempt: number;
  delayMs: number;
  failureClass?: FailureClass;
  error?: string;
}

export class RetryPolicy {
  private readonly options: Required<RetryPolicyOptions>;

  constructor(options?: Partial<RetryPolicyOptions>) {
    this.options = {
      maxAttempts: options?.maxAttempts ?? 3,
      baseDelayMs: options?.baseDelayMs ?? 100,
      maxDelayMs: options?.maxDelayMs ?? 2_000,
      backoffMultiplier: options?.backoffMultiplier ?? 2,
      escalationThreshold: options?.escalationThreshold ?? 2,
      classifyFailure:
        options?.classifyFailure ??
        ((error) => {
          const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
          if (message.includes("auth") || message.includes("permission") || message.includes("schema")) {
            return "permanent";
          }
          if (message.includes("panic") || message.includes("corrupt")) {
            return "escalate";
          }
          return "retryable";
        }),
    };
  }

  async run<T>(
    operation: (state: RetryAttemptState) => Promise<T>,
    onAttempt?: (state: RetryAttemptState) => void,
  ): Promise<T> {
    let retryableFailures = 0;
    let delayMs = this.options.baseDelayMs;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      const state: RetryAttemptState = { attempt, delayMs };
      onAttempt?.(state);
      try {
        return await operation(state);
      } catch (error) {
        const failureClass = this.options.classifyFailure(error);
        state.failureClass = failureClass;
        state.error = error instanceof Error ? error.message : String(error);
        onAttempt?.(state);

        if (failureClass === "permanent") throw error;
        if (failureClass === "escalate") {
          throw new Error(`Escalation required after attempt ${attempt}: ${state.error}`);
        }

        retryableFailures += 1;
        if (retryableFailures >= this.options.escalationThreshold) {
          throw new Error(`Escalation threshold reached after ${retryableFailures} retryable failures: ${state.error}`);
        }

        if (attempt >= this.options.maxAttempts) {
          throw error;
        }

        await this.sleep(delayMs);
        delayMs = Math.min(this.options.maxDelayMs, Math.floor(delayMs * this.options.backoffMultiplier));
      }
    }

    throw new Error("Retry policy exited unexpectedly");
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
