#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1];
}

const reportPath = resolve(process.cwd(), getArg("--report", "tests/evals/reports/latest.json"));
const baselinePath = resolve(process.cwd(), getArg("--baseline", "docs/analysis/eval-baseline.json"));
const thresholdPath = resolve(process.cwd(), getArg("--thresholds", "tests/evals/release-gate.thresholds.json"));

const report = JSON.parse(readFileSync(reportPath, "utf-8"));
const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
const thresholds = JSON.parse(readFileSync(thresholdPath, "utf-8"));

const failures = [];
const current = report.metrics;
const prior = baseline.metrics;

if (current.passRate < thresholds.minimumPassRate) {
  failures.push(`passRate ${current.passRate} < minimum ${thresholds.minimumPassRate}`);
}
if (current.retriesToSuccess > thresholds.maximumRetriesToSuccess) {
  failures.push(`retriesToSuccess ${current.retriesToSuccess} > maximum ${thresholds.maximumRetriesToSuccess}`);
}
if (current.policyViolations > thresholds.maximumPolicyViolations) {
  failures.push(`policyViolations ${current.policyViolations} > maximum ${thresholds.maximumPolicyViolations}`);
}
if (current.meanTaskDurationMs > thresholds.maximumMeanTaskDurationMs) {
  failures.push(
    `meanTaskDurationMs ${current.meanTaskDurationMs} > maximum ${thresholds.maximumMeanTaskDurationMs}`,
  );
}
if (current.regressionDelta < thresholds.minimumRegressionDelta) {
  failures.push(`regressionDelta ${current.regressionDelta} < minimum ${thresholds.minimumRegressionDelta}`);
}

const drops = thresholds.maxAllowedDrops;
if (prior.passRate - current.passRate > drops.passRate) {
  failures.push(`passRate drop ${prior.passRate - current.passRate} exceeds ${drops.passRate}`);
}
if (current.retriesToSuccess - prior.retriesToSuccess > drops.retriesToSuccess) {
  failures.push(
    `retriesToSuccess increase ${current.retriesToSuccess - prior.retriesToSuccess} exceeds ${drops.retriesToSuccess}`,
  );
}
if (current.policyViolations - prior.policyViolations > drops.policyViolations) {
  failures.push(
    `policyViolations increase ${current.policyViolations - prior.policyViolations} exceeds ${drops.policyViolations}`,
  );
}
if (current.meanTaskDurationMs - prior.meanTaskDurationMs > drops.meanTaskDurationMs) {
  failures.push(
    `meanTaskDurationMs increase ${current.meanTaskDurationMs - prior.meanTaskDurationMs} exceeds ${drops.meanTaskDurationMs}`,
  );
}
if (prior.regressionDelta - current.regressionDelta > drops.regressionDelta) {
  failures.push(
    `regressionDelta drop ${prior.regressionDelta - current.regressionDelta} exceeds ${drops.regressionDelta}`,
  );
}

if (failures.length > 0) {
  console.error("❌ Eval release gate failed:");
  for (const failure of failures) {
    console.error(` - ${failure}`);
  }
  process.exit(1);
}

console.log("✅ Eval release gate passed.");
