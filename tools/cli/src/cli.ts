import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

export interface EvalAttempt {
  success: boolean;
  durationMs: number;
  policyViolations: number;
  regressionDelta: number;
}

export interface EvalTask {
  id: string;
  category: "bug-fix" | "refactor" | "policy-compliance" | "docs-update";
  prompt: string;
  attempts: EvalAttempt[];
}

export interface EvalSuite {
  suite: string;
  generatedAt?: string;
  tasks: EvalTask[];
}

export interface EvalMetrics {
  passRate: number;
  retriesToSuccess: number;
  policyViolations: number;
  meanTaskDurationMs: number;
  regressionDelta: number;
}

export interface EvalTaskResult {
  id: string;
  category: EvalTask["category"];
  passed: boolean;
  attempts: number;
  retries: number;
  finalDurationMs: number;
  policyViolations: number;
  regressionDelta: number;
}

export interface EvalReport {
  suite: string;
  generatedAt: string;
  metrics: EvalMetrics;
  taskResults: EvalTaskResult[];
}

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
  const args = argv.slice(2);

  if (args[0] === "eval" && args[1] === "run") {
    return { command: "eval:run", args: args.slice(2) };
  }

  return { command: args[0] ?? "help", args: args.slice(1) };
}

<<<<<<< HEAD
function getFlagValue(args: string[], name: string): string | undefined {
  const index = args.findIndex((a) => a === name);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function loadEvalSuite(suitePath: string): EvalSuite {
  const content = readFileSync(suitePath, "utf-8");
  return JSON.parse(content) as EvalSuite;
}

export function runEvalSuite(suite: EvalSuite): EvalReport {
  const taskResults: EvalTaskResult[] = suite.tasks.map((task) => {
    const attempts = task.attempts.length;
    const finalAttempt = task.attempts[attempts - 1];
    return {
      id: task.id,
      category: task.category,
      passed: finalAttempt.success,
      attempts,
      retries: Math.max(attempts - 1, 0),
      finalDurationMs: finalAttempt.durationMs,
      policyViolations: task.attempts.reduce((sum, attempt) => sum + attempt.policyViolations, 0),
      regressionDelta: finalAttempt.regressionDelta,
    };
  });

  const totalTasks = taskResults.length || 1;
  const passedTasks = taskResults.filter((t) => t.passed).length;
  const successfulTasks = taskResults.filter((t) => t.passed);

  const metrics: EvalMetrics = {
    passRate: passedTasks / totalTasks,
    retriesToSuccess:
      successfulTasks.length === 0
        ? 0
        : successfulTasks.reduce((sum, task) => sum + task.retries, 0) / successfulTasks.length,
    policyViolations: taskResults.reduce((sum, task) => sum + task.policyViolations, 0),
    meanTaskDurationMs: taskResults.reduce((sum, task) => sum + task.finalDurationMs, 0) / totalTasks,
    regressionDelta: taskResults.reduce((sum, task) => sum + task.regressionDelta, 0) / totalTasks,
  };

  return {
    suite: suite.suite,
    generatedAt: new Date().toISOString(),
    metrics,
    taskResults,
  };
}

export function executeEvalRun(repoRoot: string, args: string[]): EvalReport {
  const suitePath = resolve(repoRoot, getFlagValue(args, "--suite") ?? "tests/evals/suites/core.json");
  const reportPath = getFlagValue(args, "--out");

  const suite = loadEvalSuite(suitePath);
  const report = runEvalSuite(suite);

  if (reportPath) {
    const resolvedPath = resolve(repoRoot, reportPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  }

  return report;
}

/** Main CLI entry point. Returns exit code. */
export function run(argv: string[], repoRoot: string): number {
=======
export type ObsQueryType = "logs" | "metrics" | "traces";

export function parseObsArgs(args: string[]): { type: ObsQueryType; query?: string; since?: string } {
  if (args[0] !== "query") {
    throw new Error("Usage: gpc obs query --type logs|metrics|traces [--query <expr>] [--since 15m]");
  }

  const typeFlag = args.find((arg) => arg.startsWith("--type="));
  const queryFlag = args.find((arg) => arg.startsWith("--query="));
  const sinceFlag = args.find((arg) => arg.startsWith("--since="));
  const type = typeFlag?.split("=")[1] as ObsQueryType | undefined;

  if (!type || !["logs", "metrics", "traces"].includes(type)) {
    throw new Error("--type must be one of logs|metrics|traces");
  }

  return {
    type,
    query: queryFlag?.split("=")[1],
    since: sinceFlag?.split("=")[1],
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`request failed (${res.status}): ${url}`);
  }
  return res.json();
}

export async function runObsQuery(type: ObsQueryType, query?: string, since = "15m"): Promise<unknown> {
  if (type === "metrics") {
    const endpoint = process.env.GPC_OBS_PROMETHEUS_URL ?? "http://127.0.0.1:9090";
    const expr = encodeURIComponent(query ?? "up");
    return fetchJson(`${endpoint}/api/v1/query?query=${expr}`);
  }

  if (type === "logs") {
    const endpoint = process.env.GPC_OBS_LOKI_URL ?? "http://127.0.0.1:3100";
    const expr = encodeURIComponent(query ?? '{service_name=~".+"}');
    return fetchJson(`${endpoint}/loki/api/v1/query_range?query=${expr}&limit=20&since=${encodeURIComponent(since)}`);
  }

  const endpoint = process.env.GPC_OBS_TEMPO_URL ?? "http://127.0.0.1:3200";
  const tags = encodeURIComponent(`service.name=${query ?? "gpc-api"}`);
  return fetchJson(`${endpoint}/api/search?limit=20&tags=${tags}`);
}

/** Main CLI entry point. Returns exit code. */
export async function run(argv: string[], repoRoot: string): Promise<number> {
>>>>>>> origin/pr17
  const { command, args } = parseArgs(argv);

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

<<<<<<< HEAD
    case "eval:run": {
      const report = executeEvalRun(repoRoot, args);
      emit("info", "cli.eval.complete", "Eval suite completed.", { report });
      return 0;
=======
    case "obs": {
      try {
        const parsed = parseObsArgs(args);
        const result = await runObsQuery(parsed.type, parsed.query, parsed.since);
        console.log(JSON.stringify(result, null, 2));
        return 0;
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        return 1;
      }
>>>>>>> origin/pr17
    }

    case "help":
    default:
<<<<<<< HEAD
      emit("info", "cli.help", "CLI usage output.", {
        usage: [
          "gpc validate    Validate repository structure",
          "gpc skills      List available agent skills",
          "gpc eval run    Execute evaluation suite and emit JSON report",
          "gpc help        Show this help message",
        ],
      });
=======
      console.log(`gpc — GPC Monorepo CLI

Usage:
  gpc validate    Validate repository structure
  gpc skills      List available agent skills
  gpc obs query --type=<logs|metrics|traces> [--query=<expr>] [--since=<window>]
  gpc help        Show this help message
`);
>>>>>>> origin/pr17
      return 0;
  }
}
