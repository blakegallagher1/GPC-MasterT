/**
 * Observability query helpers — local stack endpoint resolution and query execution.
 */

export type ObsQueryType = "logs" | "metrics" | "traces";

export interface ObsQueryResult {
  type: ObsQueryType;
  endpoint: string;
  query: string;
  note: string;
}

export function parseObsArgs(args: string[]): { type: ObsQueryType; query?: string; since?: string } {
  if (args[0] !== "query") {
    throw new Error("Usage: gpc obs query --type logs|metrics|traces [--query <expr>] [--since 15m]");
  }

  const typeFlag = args.find((arg) => arg.startsWith("--type="));
  const queryFlag = args.find((arg) => arg.startsWith("--query="));
  const sinceFlag = args.find((arg) => arg.startsWith("--since="));
  const type = typeFlag?.split("=")[1] as ObsQueryType | undefined;

  if (!type || !["logs", "metrics", "traces"].includes(type)) {
    throw new Error("--type must be one of logs|metrics|traces");
  }

  return { type, query: queryFlag?.split("=")[1], since: sinceFlag?.split("=")[1] };
}

export function buildObsQuery(queryType: string): ObsQueryResult {
  const table: Record<ObsQueryType, ObsQueryResult> = {
    traces: { type: "traces", endpoint: "http://localhost:3200", query: "{}", note: "Tempo/Jaeger local traces" },
    metrics: { type: "metrics", endpoint: "http://localhost:9090", query: "up", note: "Prometheus local metrics" },
    logs: {
      type: "logs", endpoint: "http://localhost:3100",
      query: '{service_name="agent-runtime"}', note: "Loki local logs",
    },
  };
  const key = queryType as ObsQueryType;
  if (table[key]) return table[key];
  return { type: "traces", endpoint: "http://localhost:3200", query: "{}", note: "Fallback default (traces)" };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed (${res.status}): ${url}`);
  return res.json();
}

export async function runObsQuery(type: ObsQueryType, query?: string, since = "15m"): Promise<unknown> {
  if (type === "metrics") {
    const endpoint = process.env.GPC_OBS_PROMETHEUS_URL ?? "http://127.0.0.1:9090";
    const expr = encodeURIComponent(query ?? "up");
    return fetchJson(`${endpoint}/api/v1/query?query=${expr}`);
  }
  if (type === "logs") {
    const endpoint = process.env.GPC_OBS_LOKI_URL ?? "http://127.0.0.1:3100";
    const expr = encodeURIComponent(query ?? '{service_name=~".+"}');
    return fetchJson(`${endpoint}/loki/api/v1/query_range?query=${expr}&limit=20&since=${encodeURIComponent(since)}`);
  }
  const endpoint = process.env.GPC_OBS_TEMPO_URL ?? "http://127.0.0.1:3200";
  const tags = encodeURIComponent(`service.name=${query ?? "gpc-api"}`);
  return fetchJson(`${endpoint}/api/search?limit=20&tags=${tags}`);
}
