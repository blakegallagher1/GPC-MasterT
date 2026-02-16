import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, validateStructure, discoverSkills } from "./cli.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseArgs", () => {
  it("extracts command from argv", () => {
    const result = parseArgs(["node", "gpc", "validate"]);
    assert.equal(result.command, "validate");
  });

  it("defaults to help when no command given", () => {
    const result = parseArgs(["node", "gpc"]);
    assert.equal(result.command, "help");
  });
});

describe("validateStructure", () => {
  it("reports missing paths in an empty directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const result = validateStructure(tmp);
      assert.equal(result.valid, false);
      assert.ok(result.missing.length > 0);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});

describe("discoverSkills", () => {
  it("finds skills with SKILL.md files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const skillsDir = join(tmp, "skills", "my-skill");
      mkdirSync(skillsDir, { recursive: true });
      writeFileSync(join(skillsDir, "SKILL.md"), "# My Skill\nDoes things.");
      const skills = discoverSkills(tmp);
      assert.equal(skills.length, 1);
      assert.equal(skills[0].name, "my-skill");
      assert.equal(skills[0].description, "My Skill");
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });

  it("returns empty array when no skills directory", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gpc-test-"));
    try {
      const skills = discoverSkills(tmp);
      assert.deepEqual(skills, []);
    } finally {
      rmSync(tmp, { recursive: true });
    }
  });
});
