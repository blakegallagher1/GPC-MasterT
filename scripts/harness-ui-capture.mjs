#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const FLOW_DEFINITIONS = {
  "legal-chat-login": {
    entrypoint: "/login",
    accountIdentity: process.env.HARNESS_ACCOUNT_IDENTITY ?? "qa+legal-chat@example.com",
    run: async ({ page, baseUrl, screenshotPath }) => {
      await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      await page.screenshot({ path: screenshotPath, fullPage: true });
    },
  },
  "legal-chat-query": {
    entrypoint: "/legal-chat",
    accountIdentity: process.env.HARNESS_ACCOUNT_IDENTITY ?? "qa+legal-chat@example.com",
    run: async ({ page, baseUrl, screenshotPath }) => {
      await page.goto(new URL("/legal-chat", baseUrl).toString(), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);
      const query = process.env.HARNESS_CHAT_QUERY ?? "Summarize the indemnification clause.";
      const textbox = page.locator('textarea, input[type="text"], [contenteditable="true"]').first();
      if (await textbox.count()) {
        await textbox.fill(query);
      }
      await page.screenshot({ path: screenshotPath, fullPage: true });
    },
  },
};

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

async function loadContract(repoRoot) {
  const contractPath = resolve(repoRoot, "risk-policy.contract.json");
  const raw = await import("node:fs/promises").then((fs) => fs.readFile(contractPath, "utf8"));
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const headSha = args["head-sha"] ?? process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const baseUrl = args["base-url"] ?? process.env.HARNESS_BASE_URL ?? "http://127.0.0.1:3000";
  const contract = await loadContract(repoRoot);
  const flows = contract.browserEvidence.requiredFlows;

  const runDir = resolve(repoRoot, "artifacts", "browser-evidence", headSha);
  const screenshotDir = resolve(runDir, "screenshots");
  const traceDir = resolve(runDir, "traces");
  const videoDir = resolve(runDir, "videos");

  await mkdir(screenshotDir, { recursive: true });
  await mkdir(traceDir, { recursive: true });
  if (process.env.HARNESS_UI_VIDEO === "1") {
    await mkdir(videoDir, { recursive: true });
  }

  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("Playwright dependency is missing. Install with `pnpm add -Dw playwright`.");
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const entries = [];

  try {
    for (const flowName of flows) {
      const flow = FLOW_DEFINITIONS[flowName];
      if (!flow) {
        throw new Error(`No Playwright flow definition for required flow: ${flowName}`);
      }

      const flowVideoDir = resolve(videoDir, flowName);
      if (process.env.HARNESS_UI_VIDEO === "1") {
        await mkdir(flowVideoDir, { recursive: true });
      }

      const context = await browser.newContext(
        process.env.HARNESS_UI_VIDEO === "1"
          ? { recordVideo: { dir: flowVideoDir, size: { width: 1280, height: 720 } } }
          : undefined,
      );
      const page = await context.newPage();
      await context.tracing.start({ screenshots: true, snapshots: true });

      const screenshotFile = `${flowName}.png`;
      const traceFile = `${flowName}.zip`;
      const screenshotPath = resolve(screenshotDir, screenshotFile);
      const tracePath = resolve(traceDir, traceFile);

      await flow.run({ page, baseUrl, screenshotPath });
      await context.tracing.stop({ path: tracePath });
      await context.close();

      const artifacts = [relative(runDir, screenshotPath), relative(runDir, tracePath)];

      if (process.env.HARNESS_UI_VIDEO === "1" && existsSync(flowVideoDir)) {
        const files = await import("node:fs/promises").then((fs) => fs.readdir(flowVideoDir));
        for (const file of files) {
          artifacts.push(relative(runDir, resolve(flowVideoDir, file)));
        }
      }

      entries.push({
        flowName,
        entrypoint: flow.entrypoint,
        accountIdentity: flow.accountIdentity,
        timestamp: new Date().toISOString(),
        artifacts,
      });

      console.log(`Captured browser evidence flow: ${flowName}`);
    }
  } finally {
    await browser.close();
  }

  const manifest = { headSha, entries };
  const manifestPath = resolve(runDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Browser evidence written to: ${runDir}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
