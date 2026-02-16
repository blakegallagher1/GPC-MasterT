import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

/** Discover skills by scanning the skills/ directory for SKILL.md files. */
export function discoverSkills(repoRoot: string): { name: string; description: string }[] {
  const skillsDir = join(repoRoot, "skills");
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: { name: string; description: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillFile)) {
      const content = readFileSync(skillFile, "utf-8");
      const firstLine = content.split("\n").find((l: string) => l.startsWith("# "));
      skills.push({
        name: entry.name,
        description: firstLine ? firstLine.replace(/^#\s*/, "") : entry.name,
      });
    }
  }

  return skills;
}

/** Validate the required repository structure. */
export function validateStructure(repoRoot: string): { valid: boolean; missing: string[] } {
  const requiredPaths = [
    "AGENTS.md",
    "apps/web",
    "apps/api",
    "packages/agent-runtime",
    "infra/terraform/environments/dev",
    "infra/kubernetes/overlays/prod",
    "tools/review-loop",
    "skills/browser-qa",
    "observability/dashboards",
    "tests/e2e",
    "docs/playbooks",
  ];

  const missing: string[] = [];
  for (const p of requiredPaths) {
    if (!existsSync(resolve(repoRoot, p))) {
      missing.push(p);
    }
  }

  return { valid: missing.length === 0, missing };
}

/** Parse CLI arguments into a command and flags. */
export function parseArgs(argv: string[]): { command: string; args: string[] } {
  // Skip node and script path
  const args = argv.slice(2);
  return { command: args[0] ?? "help", args: args.slice(1) };
}

/** Main CLI entry point. Returns exit code. */
export function run(argv: string[], repoRoot: string): number {
  const { command } = parseArgs(argv);

  switch (command) {
    case "validate": {
      const result = validateStructure(repoRoot);
      if (result.valid) {
        emit("info", "cli.validate.success", "Repository structure is valid.");
        return 0;
      }

      emit("error", "cli.validate.failure", "Missing required paths.", {
        missingPaths: result.missing,
      });
      return 1;
    }

    case "skills": {
      const skills = discoverSkills(repoRoot);
      if (skills.length === 0) {
        emit("info", "cli.skills.none", "No skills found.");
      } else {
        emit("info", "cli.skills.list", "Available skills discovered.", { skills });
      }
      return 0;
    }

    case "help":
    default:
      emit("info", "cli.help", "CLI usage output.", {
        usage: [
          "gpc validate    Validate repository structure",
          "gpc skills      List available agent skills",
          "gpc help        Show this help message",
        ],
      });
      return 0;
  }
}
