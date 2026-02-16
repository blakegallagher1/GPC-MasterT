#!/usr/bin/env bash
set -euo pipefail

# harness-risk-tier.sh — Compute and display the risk tier for changed files.
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

# Use the compiled @gpc/config package if available, else fall back to
# direct JSON parsing with simple string matching.
CHANGED_FILES="$FILES" node --input-type=module <<'SCRIPT'
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const files = process.env.CHANGED_FILES.split(/[\s,]+/).filter(Boolean);
const contractPath = resolve(process.cwd(), 'risk-policy.contract.json');
const contract = JSON.parse(await readFile(contractPath, 'utf-8'));

function globToRegExp(pattern) {
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      result += '.*';
      i += 2;
      if (pattern[i] === '/') i++; // skip trailing slash after **
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

let tier = 'low';
for (const file of files) {
  for (const pattern of contract.riskTierRules.high) {
    if (globToRegExp(pattern).test(file)) {
      tier = 'high';
      console.log('  HIGH-RISK match: ' + file + ' (' + pattern + ')');
    }
  }
}

console.log('');
console.log('Risk tier: ' + tier);
console.log('Required checks: ' + contract.mergePolicy[tier].requiredChecks.join(', '));
console.log('Review agent required: ' + (contract.mergePolicy[tier].requireCodeReviewAgent ?? false));
console.log('Browser evidence required: ' + (contract.mergePolicy[tier].requireBrowserEvidence ?? false));
SCRIPT
