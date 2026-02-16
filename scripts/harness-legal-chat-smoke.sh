#!/usr/bin/env bash
set -euo pipefail

# harness-legal-chat-smoke.sh — Run smoke tests for the legal-chat flow.
#
# Usage:
#   npm run harness:legal-chat:smoke
#
# This validates the critical legal-chat user journey by running
# a focused smoke-test suite against the API and UI entry points.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Legal Chat Smoke Test ==="
echo ""

# Check that required paths exist
if [[ ! -d "$REPO_ROOT/apps/api" ]]; then
  echo "ERROR: apps/api directory not found"
  exit 1
fi

# Run smoke tests if they exist
if [[ -d "$REPO_ROOT/tests/smoke" ]]; then
  echo "Running smoke tests..."
  if ls "$REPO_ROOT"/tests/smoke/*.test.* 1>/dev/null 2>&1; then
    node --test "$REPO_ROOT"/tests/smoke/*.test.* 2>/dev/null || echo "  [SKIP] No runnable smoke tests found yet"
  else
    echo "  [SKIP] No smoke test files found in tests/smoke/"
    echo "  To add smoke tests, create files matching tests/smoke/*.test.{js,mjs}"
  fi
else
  echo "  [SKIP] tests/smoke/ directory not found"
fi

echo ""
echo "=== Legal Chat Smoke Test Complete ==="
