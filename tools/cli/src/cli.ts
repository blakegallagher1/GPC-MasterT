import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { executeEvalRun } from "./eval-runner.js";
import { buildObsQuery, parseObsArgs, runObsQuery } from "./obs-query.js";

export type { EvalAttempt, EvalTask, EvalSuite, EvalMetrics, EvalTaskResult, EvalReport } from "./eval-runner.js";
export { loadEvalSuite, runEvalSuite, executeEvalRun } from "./eval-runner.js";
export type { ObsQueryType, ObsQueryResult } from "./obs-query.js";
export { parseObsArgs, buildObsQuery, runObsQuery } from "./obs-query.js";

function emit(level: "info" | "error", event: string, message: string, context?: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(), level, event, message,
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
    "AGENTS.md", "apps/web", "apps/api", "packages/agent-runtime",
    "infra/terraform/environments/dev", "infra/kubernetes/overlays/prod",
    "tools/review-loop", "skills/browser-qa", "observability/dashboards",
    "tests/e2e", "docs/playbooks",
  ];
  const missing: string[] = [];
  for (const p of requiredPaths) {
    if (!existsSync(resolve(repoRoot, p))) missing.push(p);
  }
  return { valid: missing.length === 0, missing };
}

/** Parse CLI arguments into a command and flags. */
export function parseArgs(argv: string[]): { command: string; args: string[] } {
  const args = argv.slice(2);
  if (args[0] === "eval" && args[1] === "run") return { command: "eval:run", args: args.slice(2) };
  if (args[0] === "obs" && args[1] === "query") return { command: "obs:query", args: args.slice(2) };
  if (args[0] === "obs") return { command: "obs", args: args.slice(1) };
  return { command: args[0] ?? "help", args: args.slice(1) };
}

/** Main CLI entry point. Returns exit code. */
export async function run(argv: string[], repoRoot: string): Promise<number> {
  const { command, args } = parseArgs(argv);

  switch (command) {
    case "validate": {
      const result = validateStructure(repoRoot);
      if (result.valid) {
        emit("info", "cli.validate.success", "Repository structure is valid.");
        return 0;
      }
      emit("error", "cli.validate.failure", "Missing required paths.", { missingPaths: result.missing });
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

    case "eval:run": {
      const report = executeEvalRun(repoRoot, args);
      emit("info", "cli.eval.complete", "Eval suite completed.", { report });
      return 0;
    }

    case "obs:query": {
      const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1] ?? "traces";
      const result = buildObsQuery(typeArg);
      emit("info", "cli.obs.query", "Observability query resolved.", { result });
      return 0;
    }

    case "obs": {
      try {
        const parsed = parseObsArgs(args);
        const obsResult = await runObsQuery(parsed.type, parsed.query, parsed.since);
        emit("info", "cli.obs.result", "Observability query completed.", { result: obsResult });
        return 0;
      } catch (err) {
        emit("error", "cli.obs.error", err instanceof Error ? err.message : String(err));
        return 1;
      }
    }

    case "help":
    default:
      emit("info", "cli.help", "CLI usage output.", {
        usage: [
          "gpc validate      Validate repository structure",
          "gpc skills         List available agent skills",
          "gpc eval run       Execute evaluation suite and emit JSON report",
          "gpc obs query      Query local observability stack",
          "gpc help           Show this help message",
        ],
      });
      return 0;
  }
}
