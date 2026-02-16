import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatIssue,
  lintDependencyDirection,
  lintFileSize,
  lintNamingConvention,
  lintStructuredLogging,
} from "./custom-lint-rules.mjs";

describe("custom lint rules", () => {
  it("enforces dependency direction", () => {
    const issues = lintDependencyDirection(
      "packages/config/src/contract.ts",
      'import { x } from "../../../apps/api/src/index.js";',
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "structure/dependency-direction");
    assert.match(issues[0].remediation, /move shared code into packages\//);
  });

  it("allows valid dependency direction", () => {
    const issues = lintDependencyDirection(
      "apps/api/src/index.ts",
      'import { x } from "@gpc/config";',
    );
    assert.equal(issues.length, 0);
  });

  it("flags unstructured logging in source modules", () => {
    const issues = lintStructuredLogging("packages/config/src/contract.ts", "console.log('oops')");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "logging/structured-events");
  });

  it("enforces kebab-case file naming", () => {
    const issues = lintNamingConvention("packages/config/src/BadName.ts");
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "naming/file-kebab-case");
  });

  it("enforces max file size", () => {
    const source = Array.from({ length: 6 }, () => "const x = 1;").join("\n");
    const issues = lintFileSize("packages/config/src/contract.ts", source, 5);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].ruleId, "maintainability/file-size");
  });

  it("formats lint issues with remediation instructions", () => {
    const text = formatIssue({
      ruleId: "demo/rule",
      filePath: "packages/config/src/file.ts",
      message: "example",
      remediation: "Agent remediation: do the thing.",
    });

    assert.match(text, /demo\/rule/);
    assert.match(text, /Agent remediation/);
  });
});
