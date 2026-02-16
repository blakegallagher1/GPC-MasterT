#!/usr/bin/env bash
set -euo pipefail

required_paths=(
  "AGENTS.md"
  "risk-policy.contract.json"
  "apps/web"
  "apps/api"
  "packages/agent-runtime"
  "packages/config/src"
  "infra/terraform/environments/dev"
  "infra/kubernetes/overlays/prod"
  "tools/review-loop/src"
  "skills/browser-qa"
  "observability/dashboards"
  "tests/e2e"
  "tests/contract"
  "docs/playbooks"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "missing required path: $path" >&2
    exit 1
  fi
done

echo "structure verification passed"
