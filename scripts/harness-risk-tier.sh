#!/usr/bin/env bash
set -euo pipefail

# harness-risk-tier.sh — Compute and display adaptive risk score/tier.
#
# Usage:
#   npm run harness:risk-tier
#   bash scripts/harness-risk-tier.sh [file1 file2 ...]
#
# If no files are provided, uses git diff against main to detect changes.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ $# -gt 0 ]]; then
  FILES="$*"
else
  FILES=$(git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")
fi

if [[ -z "$FILES" ]]; then
  echo "No changed files detected — defaulting to low risk tier"
  exit 0
fi

echo "Changed files:"
echo "$FILES" | tr ' ' '\n' | sed 's/^/  /'
echo ""

CHANGED_FILES="$FILES" node --input-type=module <<'SCRIPT'
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = process.env.CHANGED_FILES.split(/[\s,]+/).filter(Boolean);
const contractPath = resolve(process.cwd(), 'risk-policy.contract.json');
const metadataPath = resolve(process.cwd(), 'risk-signals.metadata.json');
const contract = JSON.parse(await readFile(contractPath, 'utf-8'));
const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

function globToRegExp(pattern) {
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (ch === '*') {
      result += '[^/]*';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      result += '\\' + ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }
  return new RegExp('^' + result + '$');
}

const semanticSignals = [
  {
    category: 'semantic-public-api',
    signal: 'public-api-change',
    patterns: ['**/src/index.ts', '**/*.d.ts', 'app/api/**'],
    weight: 20,
    rationale: 'Public API changes can impact downstream consumers.',
  },
  {
    category: 'semantic-auth-permissions',
    signal: 'auth-or-permissions-touchpoint',
    patterns: ['**/auth/**', '**/permissions/**', '**/rbac/**', '**/policy/**'],
    weight: 25,
    rationale: 'Auth and permission changes are security-sensitive.',
  },
  {
    category: 'semantic-migration',
    signal: 'migration-change',
    patterns: ['**/migrations/**', '**/*.sql', 'db/schema.ts'],
    weight: 20,
    rationale: 'Schema/migration changes are higher-risk to production data paths.',
  },
  {
    category: 'semantic-workflow',
    signal: 'workflow-change',
    patterns: ['.github/workflows/**', 'scripts/**'],
    weight: 15,
    rationale: 'Workflow changes can alter CI/CD and governance execution.',
  },
];

const triggeredSignals = [];
const sortedFiles = [...files].sort();

const highMatches = sortedFiles.filter((file) =>
  contract.riskTierRules.high.some((pattern) => globToRegExp(pattern).test(file)),
);
if (highMatches.length > 0) {
  triggeredSignals.push({
    category: 'contract-rule',
    signal: 'high-tier-contract-pattern',
    weight: 70,
    rationale: 'Matched explicit high-risk pattern from risk-policy contract.',
    matchedFiles: highMatches,
  });
}

for (const semantic of semanticSignals) {
  const matches = sortedFiles.filter((file) =>
    semantic.patterns.some((pattern) => globToRegExp(pattern).test(file)),
  );
  if (matches.length > 0) {
    triggeredSignals.push({ ...semantic, matchedFiles: matches });
  }
}

for (const [category, signalPrefix, entries] of [
  ['history-flaky-tests', 'flaky', metadata.recentFlakyTests ?? []],
  ['history-incidents', 'incident', metadata.incidentTaggedFiles ?? []],
  ['history-rollbacks', 'rollback', metadata.priorRollbackAreas ?? []],
]) {
  for (const entry of entries) {
    const matches = sortedFiles.filter((file) => globToRegExp(entry.pattern).test(file));
    if (matches.length > 0) {
      triggeredSignals.push({
        category,
        signal: `${signalPrefix}:${entry.pattern}`,
        weight: entry.weight,
        rationale: entry.reason,
        matchedFiles: matches,
      });
    }
  }
}

const score = triggeredSignals.reduce((sum, signal) => sum + signal.weight, 0);
const threshold = 60;
const tier = score >= threshold ? 'high' : 'low';

for (const signal of triggeredSignals) {
  console.log(`  SIGNAL ${signal.category} (+${signal.weight}): ${signal.signal}`);
  console.log(`    files: ${signal.matchedFiles.join(', ')}`);
  console.log(`    rationale: ${signal.rationale}`);
}

const explanation = {
  triggeredSignals,
  scoreBreakdown: triggeredSignals.map((s) => `${s.signal} (+${s.weight}) => ${s.matchedFiles.join(', ')}`),
};

console.log('');
console.log('Risk score: ' + score + ' (threshold=' + threshold + ')');
console.log('Risk tier: ' + tier);
console.log('Required checks: ' + contract.mergePolicy[tier].requiredChecks.join(', '));
console.log('Review agent required: ' + (contract.mergePolicy[tier].requireCodeReviewAgent ?? false));
console.log('Browser evidence required: ' + (contract.mergePolicy[tier].requireBrowserEvidence ?? false));
console.log('Risk explanation:');
console.log(JSON.stringify(explanation, null, 2));
SCRIPT
