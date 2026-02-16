import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  const { command, args } = parseArgs(argv);

  switch (command) {
    case "validate": {
      const result = validateStructure(repoRoot);
      if (result.valid) {
        console.log("✅ Repository structure is valid.");
        return 0;
      } else {
        console.error("❌ Missing required paths:");
        for (const p of result.missing) {
          console.error(`   - ${p}`);
        }
        return 1;
      }
    }

    case "skills": {
      const skills = discoverSkills(repoRoot);
      if (skills.length === 0) {
        console.log("No skills found.");
      } else {
        console.log("Available skills:");
        for (const s of skills) {
          console.log(`  • ${s.name} — ${s.description}`);
        }
      }
      return 0;
    }

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
    }

    case "help":
    default:
      console.log(`gpc — GPC Monorepo CLI

Usage:
  gpc validate    Validate repository structure
  gpc skills      List available agent skills
  gpc obs query --type=<logs|metrics|traces> [--query=<expr>] [--since=<window>]
  gpc help        Show this help message
`);
      return 0;
  }
}
