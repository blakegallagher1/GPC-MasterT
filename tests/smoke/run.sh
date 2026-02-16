#!/usr/bin/env bash
# Smoke tests: verify that all packages build and their basic tests pass.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== Smoke Test Suite ==="

echo "1. Verifying repository structure..."
bash scripts/verify-structure.sh

echo "2. Building all packages..."
pnpm -r build

echo "3. Running package tests..."
pnpm -r test

echo "4. Verifying CLI runs..."
node tools/cli/dist/index.js validate
node tools/cli/dist/index.js skills

echo ""
echo "✅ All smoke tests passed."
