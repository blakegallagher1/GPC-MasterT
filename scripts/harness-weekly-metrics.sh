#!/usr/bin/env bash
set -euo pipefail

# harness-weekly-metrics.sh — Collect and report weekly harness metrics.
#
# Usage:
#   npm run harness:weekly-metrics
#
# Tracks:
#   - Number of harness-gap issues (open vs closed)
#   - SLA compliance for harness-gap loop
#   - Test coverage by risk tier
#   - Incident-to-harness conversion rate

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Weekly Harness Metrics ==="
echo ""

# Contract summary
echo "--- Contract Summary ---"
if [[ -f "$REPO_ROOT/risk-policy.contract.json" ]]; then
  node --input-type=module <<'EOF'
  import { readFile } from 'node:fs/promises';
  import { resolve } from 'node:path';
  const contractPath = resolve(process.cwd(), 'risk-policy.contract.json');
  const contract = JSON.parse(await readFile(contractPath, 'utf-8'));
  console.log('  Contract version: ' + contract.version);
  console.log('  High-risk patterns: ' + contract.riskTierRules.high.length);
  console.log('  Harness-gap loop: ' + (contract.harnessGapLoop.enabled ? 'enabled' : 'disabled'));
  console.log('  SLA tracking: ' + (contract.harnessGapLoop.slaTracking ? 'enabled' : 'disabled'));
EOF
else
  echo "  [WARN] risk-policy.contract.json not found"
fi

echo ""

# Test inventory
echo "--- Test Inventory ---"
for dir in tests/contract tests/smoke tests/e2e tests/integration; do
  count=$(find "$REPO_ROOT/$dir" -name '*.test.*' 2>/dev/null | wc -l)
  echo "  $dir: $count test files"
done

echo ""

# Harness-gap issues (requires gh CLI — graceful fallback)
echo "--- Harness Gap Issues ---"
if command -v gh &>/dev/null; then
  open=$(gh issue list --label harness-gap --state open --json number 2>/dev/null | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).length))" 2>/dev/null || echo "N/A")
  closed=$(gh issue list --label harness-gap --state closed --json number 2>/dev/null | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).length))" 2>/dev/null || echo "N/A")
  echo "  Open: $open"
  echo "  Closed: $closed"
else
  echo "  [SKIP] gh CLI not available — cannot query issues"
  echo "  Install: https://cli.github.com/"
fi

echo ""
echo "=== Weekly Harness Metrics Complete ==="
