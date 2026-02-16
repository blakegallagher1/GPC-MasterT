import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, defaultRoutes } from "./server.js";

function fetch(port: number, method: string, path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, method, path },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("API Server", () => {
  const routes = defaultRoutes();
  const server = createApp(routes);
  let port: number;

  it("starts successfully", async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
    assert.ok(port > 0);
  });

  after(() => {
    server.close();
  });

  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(port, "GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.timestamp);
  });

  it("GET /routes returns available routes", async () => {
    const res = await fetch(port, "GET", "/routes");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.routes));
    assert.ok(res.body.routes.length >= 2);
  });

  it("GET /nonexistent returns 404", async () => {
    const res = await fetch(port, "GET", "/nonexistent");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Not Found");
  });
});
