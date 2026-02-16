#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[key.slice(2)] = value;
  }
  return args;
}

function validateBrowserEvidence(manifest, contract, currentHeadSha) {
  const config = contract.browserEvidence;

  if (manifest.headSha !== currentHeadSha) {
    throw new Error(
      `Browser evidence SHA mismatch: expected ${currentHeadSha}, got ${manifest.headSha}`,
    );
  }

  for (const flow of config.requiredFlows) {
    const found = manifest.entries.find((entry) => entry.flowName === flow);
    if (!found) {
      throw new Error(`Missing browser evidence for required flow: ${flow}`);
    }
  }

  for (const entry of manifest.entries) {
    for (const field of config.requiredFields) {
      const value = entry[field];
      if (value === undefined || value === null || value === "") {
        throw new Error(`Browser evidence entry "${entry.flowName}" missing required field: ${field}`);
      }
    }

    if (!Array.isArray(entry.artifacts) || entry.artifacts.length === 0) {
      throw new Error(`Browser evidence entry "${entry.flowName}" must include at least one artifact`);
    }
  }

  const maxAgeMs = config.maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const entry of manifest.entries) {
    const entryTime = new Date(entry.timestamp).getTime();
    if (Number.isNaN(entryTime)) {
      throw new Error(`Browser evidence entry "${entry.flowName}" has an invalid timestamp`);
    }
    if (now - entryTime > maxAgeMs) {
      throw new Error(
        `Browser evidence for "${entry.flowName}" is older than ${config.maxAgeDays} days`,
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const headSha = args["head-sha"] ?? process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

  const contract = JSON.parse(await readFile(resolve(repoRoot, "risk-policy.contract.json"), "utf8"));
  const manifestPath = args.manifest
    ? resolve(repoRoot, args.manifest)
    : resolve(repoRoot, "artifacts", "browser-evidence", headSha, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new Error(`Browser evidence manifest not found: ${manifestPath}`);
  }

  const manifestDir = dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  validateBrowserEvidence(manifest, contract, headSha);

  for (const entry of manifest.entries) {
    for (const artifact of entry.artifacts) {
      const artifactPath = resolve(manifestDir, artifact);
      if (!existsSync(artifactPath)) {
        throw new Error(`Missing artifact for flow "${entry.flowName}": ${artifact}`);
      }
    }
  }

  console.log(`Browser evidence manifest is valid: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
