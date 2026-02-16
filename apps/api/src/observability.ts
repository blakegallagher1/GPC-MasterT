import { context, metrics, trace } from "@opentelemetry/api";
import { emitStructuredLog } from "@gpc/agent-runtime";

const meter = metrics.getMeter("gpc.api", "0.1.0");
const tracer = trace.getTracer("gpc.api", "0.1.0");

export const apiTelemetry = {
  tracer,
  requestLatencyMs: meter.createHistogram("api_request_latency_ms", {
    description: "API request latency in milliseconds",
  }),
  requestErrors: meter.createCounter("api_request_errors_total", {
    description: "API request errors",
  }),
  requestCount: meter.createCounter("api_request_total", {
    description: "Total API requests",
  }),
};

export function logApi(level: "debug" | "info" | "warn" | "error", message: string, extra: Record<string, unknown>): void {
  const activeSpan = trace.getSpan(context.active());
  emitStructuredLog("api", level, message, {
    traceId: activeSpan?.spanContext().traceId,
    spanId: activeSpan?.spanContext().spanId,
    ...extra,
  });
}
