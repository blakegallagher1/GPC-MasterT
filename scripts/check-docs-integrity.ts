#!/usr/bin/env -S node --no-warnings

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname, normalize } from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const REQUIRED_INDEXES = [
  "docs/README.md",
  "docs/analysis/README.md",
  "docs/architecture/README.md",
  "docs/operating-model/README.md",
  "docs/playbooks/README.md",
  "observability/runbooks/README.md",
];

const BACKLINK_REQUIRED_PREFIX = "Back to";
const MARKDOWN_LINK = /\[[^\]]+\]\(([^)]+)\)/g;

const args = new Set(process.argv.slice(2));
const reportPath = process.argv.find((arg, idx, arr) => arr[idx - 1] === "--report");
const maxAgeArg = process.argv.find((arg, idx, arr) => arr[idx - 1] === "--max-age-days");
const maxAgeDays = Number(maxAgeArg ?? "90");

async function collectMarkdownFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        files.push(normalize(fullPath));
      }
    }
  }

  if (!existsSync(baseDir)) {
    return files;
  }

  await walk(baseDir);
  return files;
}

function toRelative(path: string): string {
  return normalize(path).replace(`${normalize(repoRoot)}/`, "");
}

function resolveMarkdownLink(currentFile: string, link: string): string | null {
  if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:")) {
    return null;
  }

  const withoutAnchor = link.split("#")[0];
  if (withoutAnchor.length === 0) {
    return null;
  }

  const target = normalize(join(dirname(currentFile), withoutAnchor));
  return target;
}

async function getLastCommitTimestamp(relativePath: string): Promise<number> {
  try {
    const output = execSync(`git log -1 --format=%ct -- ${relativePath}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) {
      const fallbackPath = join(repoRoot, relativePath);
    if (existsSync(fallbackPath)) {
      const fileStat = await stat(fallbackPath);
      return fileStat.mtimeMs;
    }
    return 0;
    }

    return Number(output) * 1000;
  } catch {
    const fallbackPath = join(repoRoot, relativePath);
    if (existsSync(fallbackPath)) {
      const fileStat = await stat(fallbackPath);
      return fileStat.mtimeMs;
    }
    return 0;
  }
}

async function main(): Promise<void> {
  const markdownFiles = [
    ...(await collectMarkdownFiles(join(repoRoot, "docs"))),
    ...(await collectMarkdownFiles(join(repoRoot, "observability", "runbooks"))),
  ];

  const missingIndexes = REQUIRED_INDEXES.filter((indexFile) => !existsSync(join(repoRoot, indexFile)));

  const missingBacklinks: string[] = [];
  const brokenLinks: string[] = [];
  const staleDocs: string[] = [];

  const now = Date.now();
  for (const file of markdownFiles) {
    const relative = toRelative(file);
    const content = await readFile(file, "utf-8");

    if (!content.includes(BACKLINK_REQUIRED_PREFIX)) {
      missingBacklinks.push(relative);
    }

    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_LINK.exec(content)) !== null) {
      const rawLink = match[1]?.trim();
      if (!rawLink) {
        continue;
      }

      const target = resolveMarkdownLink(file, rawLink);
      if (!target) {
        continue;
      }

      if (!existsSync(target)) {
        brokenLinks.push(`${relative} -> ${rawLink}`);
      }
    }

    MARKDOWN_LINK.lastIndex = 0;

    const lastUpdated = await getLastCommitTimestamp(relative);
    const ageDays = (now - lastUpdated) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      staleDocs.push(`${relative} (${Math.floor(ageDays)}d)`);
    }
  }

  if (reportPath) {
    const lines = [
      "# Stale docs report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Freshness threshold: ${maxAgeDays} days`,
      "",
      staleDocs.length === 0 ? "No stale documents detected." : "## Stale documents",
      ...staleDocs.map((line) => `- ${line}`),
      "",
      "## Integrity summary",
      `- Missing indexes: ${missingIndexes.length}`,
      `- Missing backlinks: ${missingBacklinks.length}`,
      `- Broken local references: ${brokenLinks.length}`,
      "",
      "Back to [Analysis Index](./README.md).",
    ];

    await writeFile(join(repoRoot, reportPath), lines.join("\n"));
  }

  if (missingIndexes.length > 0) {
    console.error("Missing required index files:");
    for (const file of missingIndexes) {
      console.error(`  - ${file}`);
    }
  }

  if (missingBacklinks.length > 0) {
    console.error("Markdown files missing backlinks:");
    for (const file of missingBacklinks) {
      console.error(`  - ${file}`);
    }
  }

  if (brokenLinks.length > 0) {
    console.error("Broken local markdown references:");
    for (const link of brokenLinks) {
      console.error(`  - ${link}`);
    }
  }

  if (staleDocs.length > 0) {
    console.error("Stale docs detected:");
    for (const file of staleDocs) {
      console.error(`  - ${file}`);
    }
  }

  if (missingIndexes.length || missingBacklinks.length || brokenLinks.length || staleDocs.length) {
    process.exitCode = 1;
    return;
  }

  if (!args.has("--quiet")) {
    console.log(`Docs integrity check passed across ${markdownFiles.length} markdown files.`);
  }
}

main().catch((err) => {
  console.error(`Docs integrity checker failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
