import { createApp, defaultRoutes } from "./server.js";
import { initOpenTelemetry, shutdownOpenTelemetry } from "@gpc/agent-runtime";

const port = Number(process.env.PORT) || 3000;
const routes = defaultRoutes();

await initOpenTelemetry("gpc-api");
const server = createApp(routes);

server.listen(port, () => {
  console.log(`GPC API listening on http://localhost:${port}`);
  console.log("Routes:");
  for (const r of routes) {
    console.log(`  ${r.method} ${r.path}`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close(async () => {
      await shutdownOpenTelemetry();
      process.exit(0);
    });
  });
}
