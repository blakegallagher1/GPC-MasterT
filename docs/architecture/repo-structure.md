# Target Repository Structure

This structure mirrors an agent-first product engineering setup where agents can discover, run, validate, and ship work with minimal human intervention.

```text
.
├── .github/
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
├── .changeset/
├── AGENTS.md
├── apps/
│   ├── api/
│   └── web/
├── docs/
│   ├── analysis/
│   ├── architecture/
│   ├── operating-model/
│   └── playbooks/
├── infra/
│   ├── kubernetes/
│   │   ├── base/
│   │   └── overlays/{dev,staging,prod}/
│   └── terraform/
│       └── environments/{dev,staging,prod}/
├── observability/
│   ├── alerts/
│   ├── dashboards/
│   └── runbooks/
├── packages/
│   ├── agent-runtime/
│   ├── config/
│   └── ui-kit/
├── scripts/
├── skills/
│   ├── browser-qa/
│   └── release-manager/
├── tests/
│   ├── contract/
│   ├── e2e/
│   ├── integration/
│   └── smoke/
└── tools/
    ├── cli/
    ├── review-loop/
    └── worktree-manager/
```

## Why this layout works
- **`tools/` + `skills/`**: codifies repeatable agent workflows.
- **`observability/`**: keeps telemetry and runbooks versioned with code.
- **`infra/`**: enables per-environment provisioning and deployment.
- **`tests/`**: supports gatekeeping at multiple fidelity levels.
- **`docs/operating-model` + `docs/playbooks`**: captures human steering policy.

Back to [Documentation Index](../README.md).
