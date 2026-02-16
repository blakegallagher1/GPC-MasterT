import fs from "node:fs/promises";
import path from "node:path";

const IMPORT_PATTERN = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()\s*["']([^"']+)["']/g;
const CONSOLE_PATTERN = /\bconsole\.(log|info|warn|error|debug)\s*\(/g;
const FILE_NAME_PATTERN = /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.test)?\.(?:ts|js|mjs|cjs)$/;

const MAX_LINES = 250;

function normalize(p) {
  return p.split(path.sep).join("/");
}

function getLayer(filePath) {
  const normalized = normalize(filePath);
  if (normalized.startsWith("apps/")) return "apps";
  if (normalized.startsWith("packages/")) return "packages";
  if (normalized.startsWith("tools/")) return "tools";
  return null;
}

function allowedTargetsFor(layer) {
  if (layer === "apps") return ["apps", "packages"];
  if (layer === "packages") return ["packages"];
  if (layer === "tools") return ["tools", "packages"];
  return [];
}

function toRepoImportTarget(filePath, specifier) {
  if (!specifier.startsWith(".")) {
    return specifier.startsWith("@gpc/") ? "packages" : null;
  }

  const fromDir = path.dirname(filePath);
  const resolved = path.resolve(fromDir, specifier);
  return normalize(path.relative(process.cwd(), resolved));
}

function makeIssue(ruleId, filePath, message, remediation) {
  return { ruleId, filePath: normalize(filePath), message, remediation };
}

export function lintDependencyDirection(filePath, source) {
  const issues = [];
  const layer = getLayer(filePath);
  if (!layer) return issues;

  const allowed = allowedTargetsFor(layer);
  const matches = source.matchAll(IMPORT_PATTERN);
  for (const match of matches) {
    const specifier = match[1];
    const repoTarget = toRepoImportTarget(filePath, specifier);
    if (!repoTarget) continue;

    const targetLayer = getLayer(repoTarget);
    if (!targetLayer) continue;

    if (!allowed.includes(targetLayer)) {
      issues.push(
        makeIssue(
          "structure/dependency-direction",
          filePath,
          `Invalid layer dependency: ${layer} cannot import from ${targetLayer} (${specifier}).`,
          `Agent remediation: move shared code into packages/, then update imports in ${normalize(filePath)} to target @gpc/* or same-layer modules only.`,
        ),
      );
    }
  }

  return issues;
}

export function lintStructuredLogging(filePath, source) {
  const issues = [];
  if (!normalize(filePath).includes("/src/")) return issues;

  for (const match of source.matchAll(CONSOLE_PATTERN)) {
    const method = match[1];
    issues.push(
      makeIssue(
        "logging/structured-events",
        filePath,
        `Unstructured logging via console.${method} is not allowed in source modules.`,
        "Agent remediation: replace console calls with a structured logger helper that emits JSON-like event objects (for example, log({ event, level, context })).",
      ),
    );
  }

  return issues;
}

export function lintNamingConvention(filePath) {
  const issues = [];
  const normalized = normalize(filePath);
  if (!normalized.endsWith(".ts") && !normalized.endsWith(".js") && !normalized.endsWith(".mjs") && !normalized.endsWith(".cjs")) {
    return issues;
  }

  const base = path.basename(normalized);
  if (!FILE_NAME_PATTERN.test(base)) {
    issues.push(
      makeIssue(
        "naming/file-kebab-case",
        filePath,
        `Filename "${base}" must be kebab-case with optional .test suffix.`,
        `Agent remediation: rename ${normalized} to kebab-case (example: my-module.test.ts), then update any import paths that reference the old filename.`,
      ),
    );
  }

  return issues;
}

export function lintFileSize(filePath, source, maxLines = MAX_LINES) {
  const issues = [];
  const normalized = normalize(filePath);
  if (!normalized.includes("/src/") || normalized.endsWith(".test.ts") || normalized.endsWith(".test.js")) return issues;

  const lineCount = source.split(/\r?\n/).length;
  if (lineCount > maxLines) {
    issues.push(
      makeIssue(
        "maintainability/file-size",
        filePath,
        `File has ${lineCount} lines which exceeds the limit of ${maxLines}.`,
        "Agent remediation: split this module into smaller focused units (e.g., types, helpers, runtime) and keep each file below the configured max line budget.",
      ),
    );
  }

  return issues;
}

export async function collectLintFiles(rootDir) {
  const collected = [];
  const includeRoots = ["packages", "apps", "tools", "scripts"];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(?:ts|js|mjs|cjs)$/.test(entry.name)) {
        collected.push(normalize(path.relative(rootDir, full)));
      }
    }
  }

  for (const sub of includeRoots) {
    const dir = path.join(rootDir, sub);
    try {
      const stats = await fs.stat(dir);
      if (stats.isDirectory()) {
        await walk(dir);
      }
    } catch {
      // optional folder, ignore
    }
  }

  return collected.sort();
}

export async function runCustomLints(rootDir) {
  const files = await collectLintFiles(rootDir);
  const issues = [];

  for (const rel of files) {
    const abs = path.join(rootDir, rel);
    const source = await fs.readFile(abs, "utf8");
    issues.push(...lintDependencyDirection(rel, source));
    issues.push(...lintStructuredLogging(rel, source));
    issues.push(...lintNamingConvention(rel));
    issues.push(...lintFileSize(rel, source));
  }

  return issues;
}

export function formatIssue(issue) {
  return [
    `[${issue.ruleId}] ${issue.filePath}`,
    `  - Problem: ${issue.message}`,
    `  - ${issue.remediation}`,
  ].join("\n");
}
