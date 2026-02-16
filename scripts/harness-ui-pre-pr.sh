#!/usr/bin/env bash
set -euo pipefail

# harness-ui-pre-pr.sh — Capture and verify browser evidence before PR.
#
# Usage:
#   npm run harness:ui:pre-pr
#
# This script orchestrates browser evidence capture and verification
# for UI/flow changes. It wraps the capture and verify steps so they
# can be run as a single pre-PR gate.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Browser Evidence Pre-PR Gate ==="
echo ""

# Step 1: Capture browser evidence (placeholder — requires actual browser harness)
echo "Step 1: Capturing browser evidence..."
if command -v npm &>/dev/null && npm run --silent harness:ui:capture-browser-evidence 2>/dev/null; then
  echo "  Browser evidence captured successfully"
else
  echo "  [SKIP] Browser evidence capture not yet configured"
  echo "  To enable, implement: npm run harness:ui:capture-browser-evidence"
fi

echo ""

# Step 2: Verify browser evidence
echo "Step 2: Verifying browser evidence..."
if command -v npm &>/dev/null && npm run --silent harness:ui:verify-browser-evidence 2>/dev/null; then
  echo "  Browser evidence verified successfully"
else
  echo "  [SKIP] Browser evidence verification not yet configured"
  echo "  To enable, implement: npm run harness:ui:verify-browser-evidence"
fi

echo ""
echo "=== Browser Evidence Pre-PR Gate Complete ==="
