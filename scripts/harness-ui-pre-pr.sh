#!/usr/bin/env bash
set -euo pipefail

# harness-ui-pre-pr.sh — Capture and verify browser evidence before PR.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if git rev-parse --verify origin/main >/dev/null 2>&1; then
  DIFF_BASE="origin/main...HEAD"
else
  DIFF_BASE="HEAD~1"
fi

CHANGED_FILES="$(git diff --name-only "$DIFF_BASE" 2>/dev/null || true)"

RISK_TIER="$(CHANGED_FILES="$CHANGED_FILES" node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';

const files = (process.env.CHANGED_FILES ?? '').split(/\n+/).map((value) => value.trim()).filter(Boolean);
const contract = JSON.parse(readFileSync('risk-policy.contract.json', 'utf8'));

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '.*')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

const isHigh = files.some((file) => contract.riskTierRules.high.some((pattern) => globToRegExp(pattern).test(file)));
process.stdout.write(isHigh ? 'high' : 'low');
NODE
)"

echo "=== Browser Evidence Pre-PR Gate (${RISK_TIER}) ==="

if [[ "$RISK_TIER" == "high" ]]; then
  echo "High-risk diff detected; browser evidence is mandatory."
  npm run harness:ui:capture-browser-evidence
  npm run harness:ui:verify-browser-evidence
  echo "Browser evidence captured and verified."
else
  echo "Low-risk diff detected; browser evidence capture is optional."
  if npm run --silent harness:ui:capture-browser-evidence; then
    npm run --silent harness:ui:verify-browser-evidence
    echo "Optional browser evidence captured and verified."
  else
    echo "No optional browser evidence captured for low-risk diff."
  fi
fi

echo "=== Browser Evidence Pre-PR Gate Complete ==="
