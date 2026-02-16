import { createApp, defaultRoutes } from "./server.js";

const port = Number(process.env.PORT) || 3000;
const routes = defaultRoutes();
const server = createApp(routes);

server.listen(port, () => {
  console.log(`GPC API listening on http://localhost:${port}`);
  console.log("Routes:");
  for (const r of routes) {
    console.log(`  ${r.method} ${r.path}`);
  }
});
