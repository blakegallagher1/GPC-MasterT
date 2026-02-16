#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1];
}

const reportPath = resolve(process.cwd(), getArg("--report", "tests/evals/reports/latest.json"));
const baselinePath = resolve(process.cwd(), getArg("--baseline", "docs/analysis/eval-baseline.json"));
const outputPath = resolve(process.cwd(), getArg("--out", "docs/analysis/eval-trends.md"));

const report = JSON.parse(readFileSync(reportPath, "utf-8"));
const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));

const rows = [
  ["passRate", baseline.metrics.passRate, report.metrics.passRate],
  ["retriesToSuccess", baseline.metrics.retriesToSuccess, report.metrics.retriesToSuccess],
  ["policyViolations", baseline.metrics.policyViolations, report.metrics.policyViolations],
  ["meanTaskDurationMs", baseline.metrics.meanTaskDurationMs, report.metrics.meanTaskDurationMs],
  ["regressionDelta", baseline.metrics.regressionDelta, report.metrics.regressionDelta],
];

const trendTable = rows
  .map(([metric, prior, current]) => `| ${metric} | ${prior} | ${current} | ${(Number(current) - Number(prior)).toFixed(4)} |`)
  .join("\n");

const markdown = `# Eval trends\n\nGenerated: ${report.generatedAt}\n\n| Metric | Baseline | Latest | Delta |\n| --- | ---: | ---: | ---: |\n${trendTable}\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf-8");
writeFileSync(resolve(process.cwd(), "docs/analysis/eval-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");

console.log(`Wrote trend analysis to ${outputPath}`);
