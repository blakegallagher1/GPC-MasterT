import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

export interface RuntimeTelemetry {
  taskDurationMs: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>;
  taskRunsTotal: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
  taskErrorsTotal: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
}

let tracerProvider: NodeTracerProvider | undefined;
let meterProvider: MeterProvider | undefined;

export async function initOpenTelemetry(serviceName: string, serviceVersion = "0.1.0"): Promise<void> {
  if (tracerProvider || meterProvider) {
    return;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://127.0.0.1:4318";
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
  });

  const traceExporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
  tracerProvider = new NodeTracerProvider({ resource });
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(traceExporter));
  tracerProvider.register();

  const metricExporter = new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 1_000,
  });
  meterProvider = new MeterProvider({ resource, readers: [metricReader] });
  metrics.setGlobalMeterProvider(meterProvider);
}

export async function shutdownOpenTelemetry(): Promise<void> {
  await Promise.all([tracerProvider?.shutdown(), meterProvider?.shutdown()]);
  tracerProvider = undefined;
  meterProvider = undefined;
}

const runtimeMeter = metrics.getMeter("gpc.agent-runtime", "0.1.0");
export const runtimeTelemetry: RuntimeTelemetry = {
  taskDurationMs: runtimeMeter.createHistogram("agent_task_duration_ms", {
    description: "Task duration in milliseconds",
  }),
  taskRunsTotal: runtimeMeter.createCounter("agent_task_runs_total", {
    description: "Total task runs",
  }),
  taskErrorsTotal: runtimeMeter.createCounter("agent_task_errors_total", {
    description: "Total failed task runs",
  }),
};

export function emitStructuredLog(
  service: string,
  level: "debug" | "info" | "warn" | "error",
  message: string,
  extra: Record<string, unknown> = {},
): void {
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();
  const entry = {
    timestamp: new Date().toISOString(),
    service_name: service,
    level,
    message,
    traceId: spanContext?.traceId,
    spanId: spanContext?.spanId,
    ...extra,
  };

  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

export function markSpanOk(): void {
  const span = trace.getSpan(context.active());
  span?.setStatus({ code: SpanStatusCode.OK });
}

export function markSpanError(err: unknown): void {
  const span = trace.getSpan(context.active());
  if (!span) {
    return;
  }
  span.recordException(err instanceof Error ? err : new Error(String(err)));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err instanceof Error ? err.message : String(err),
  });
}
