import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("returns development defaults when no overrides given", () => {
    const cfg = loadConfig();
    assert.equal(cfg.env, "development");
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.logLevel, "debug");
  });

  it("applies overrides", () => {
    const cfg = loadConfig({ port: 9999, logLevel: "error" });
    assert.equal(cfg.port, 9999);
    assert.equal(cfg.logLevel, "error");
  });

  it("selects staging defaults when env is staging", () => {
    const cfg = loadConfig({ env: "staging" });
    assert.equal(cfg.env, "staging");
    assert.equal(cfg.logLevel, "info");
  });

  it("selects production defaults when env is production", () => {
    const cfg = loadConfig({ env: "production" });
    assert.equal(cfg.env, "production");
    assert.equal(cfg.logLevel, "warn");
  });

  it("falls back to development for unknown env", () => {
    const cfg = loadConfig({ env: "unknown" as any });
    assert.equal(cfg.env, "development");
  });
});
