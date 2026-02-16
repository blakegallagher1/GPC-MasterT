import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { SpanStatusCode } from "@opentelemetry/api";
import { apiTelemetry, logApi } from "./observability.js";

export interface Route {
  method: string;
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}

/** Send a JSON response. */
export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Read the request body as a parsed JSON object. */
export function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString();
        resolve(text.length > 0 ? JSON.parse(text) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Health status response. */
export function healthHandler(_req: IncomingMessage, res: ServerResponse): void {
  json(res, 200, { status: "ok", timestamp: new Date().toISOString() });
}

/** List available API routes. */
export function routesHandler(routes: Route[]) {
  return (_req: IncomingMessage, res: ServerResponse): void => {
    const list = routes.map((r) => ({ method: r.method, path: r.path }));
    json(res, 200, { routes: list });
  };
}

/** Create the HTTP server with the given routes. */
export function createApp(routes: Route[]) {
  const server = createServer(async (req, res) => {
    const start = process.hrtime.bigint();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    await apiTelemetry.tracer.startActiveSpan(
      "http.request",
      {
        attributes: {
          "http.method": req.method ?? "GET",
          "http.route": url.pathname,
        },
      },
      async (span) => {
        const route = routes.find((r) => r.method === req.method && r.path === url.pathname);

        try {
          apiTelemetry.requestCount.add(1, { method: req.method ?? "UNKNOWN", path: url.pathname });
          if (route) {
            await route.handler(req, res);
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            json(res, 404, { error: "Not Found" });
            apiTelemetry.requestErrors.add(1, { method: req.method ?? "UNKNOWN", path: url.pathname, status: "404" });
            span.setStatus({ code: SpanStatusCode.ERROR, message: "route_not_found" });
          }
        } catch (err) {
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.setStatus({ code: SpanStatusCode.ERROR, message: "handler_error" });
          apiTelemetry.requestErrors.add(1, { method: req.method ?? "UNKNOWN", path: url.pathname, status: "500" });
          logApi("error", "request handler failure", {
            method: req.method,
            path: url.pathname,
            error: err instanceof Error ? err.message : String(err),
          });
          json(res, 500, { error: "Internal Server Error" });
        } finally {
          const statusCode = String(res.statusCode || 0);
          const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
          apiTelemetry.requestLatencyMs.record(durationMs, {
            method: req.method ?? "UNKNOWN",
            path: url.pathname,
            status: statusCode,
          });
          logApi("info", "request completed", {
            method: req.method,
            path: url.pathname,
            statusCode: res.statusCode,
            durationMs,
          });
          span.setAttribute("http.status_code", res.statusCode || 0);
          span.end();
        }
      },
    );
  });

  return server;
}

/** Default routes for the API. */
export function defaultRoutes(): Route[] {
  const routes: Route[] = [{ method: "GET", path: "/health", handler: healthHandler }];
  // Self-referential: list routes
  routes.push({ method: "GET", path: "/routes", handler: routesHandler(routes) });
  return routes;
}
