import { createServer, IncomingMessage, ServerResponse } from "node:http";

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
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const route = routes.find((r) => r.method === req.method && r.path === url.pathname);

    if (route) {
      try {
        await route.handler(req, res);
      } catch (err) {
        json(res, 500, { error: "Internal Server Error" });
      }
    } else {
      json(res, 404, { error: "Not Found" });
    }
  });

  return server;
}

/** Default routes for the API. */
export function defaultRoutes(): Route[] {
  const routes: Route[] = [
    { method: "GET", path: "/health", handler: healthHandler },
  ];
  // Self-referential: list routes
  routes.push({ method: "GET", path: "/routes", handler: routesHandler(routes) });
  return routes;
}
