/**
 * Eval runner — loads deterministic eval suites, runs them, and produces reports.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

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
      policyViolations: task.attempts.reduce((sum, a) => sum + a.policyViolations, 0),
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
        : successfulTasks.reduce((sum, t) => sum + t.retries, 0) / successfulTasks.length,
    policyViolations: taskResults.reduce((sum, t) => sum + t.policyViolations, 0),
    meanTaskDurationMs: taskResults.reduce((sum, t) => sum + t.finalDurationMs, 0) / totalTasks,
    regressionDelta: taskResults.reduce((sum, t) => sum + t.regressionDelta, 0) / totalTasks,
  };

  return { suite: suite.suite, generatedAt: new Date().toISOString(), metrics, taskResults };
}

function getFlagValue(args: string[], name: string): string | undefined {
  const index = args.findIndex((a) => a === name);
  if (index === -1) return undefined;
  return args[index + 1];
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
