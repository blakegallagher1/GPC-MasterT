import { createApp, defaultRoutes } from "./server.js";
import { initOpenTelemetry, shutdownOpenTelemetry } from "@gpc/agent-runtime";

function emit(level: "info" | "error", event: string, message: string, context?: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    message,
    ...(context ? { context } : {}),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const port = Number(process.env.PORT) || 3000;
const routes = defaultRoutes();

await initOpenTelemetry("gpc-api");
const server = createApp(routes);

server.listen(port, () => {
  emit("info", "api.server.started", "GPC API server is listening.", {
    port,
    routes: routes.map((route) => ({ method: route.method, path: route.path })),
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close(async () => {
      await shutdownOpenTelemetry();
      process.exit(0);
    });
  });
}
