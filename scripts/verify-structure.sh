#!/usr/bin/env bash
set -euo pipefail

required_paths=(
  "AGENTS.md"
  "apps/web"
  "apps/api"
  "packages/agent-runtime"
  "infra/terraform/environments/dev"
  "infra/kubernetes/overlays/prod"
  "tools/review-loop"
  "skills/browser-qa"
  "observability/dashboards"
  "tests/e2e"
  "docs/playbooks"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "missing required path: $path" >&2
    exit 1
  fi
done

echo "structure verification passed"
