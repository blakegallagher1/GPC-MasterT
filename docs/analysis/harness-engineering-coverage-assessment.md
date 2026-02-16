# Harness Engineering Coverage Assessment (Current Repo)

## Verdict
This repository aligns with **several core patterns** from the Harness engineering write-up, but it **does not yet implement all of them end-to-end**.

## Coverage matrix

| Theme from article | Status | Evidence in this repo | Gap to close |
|---|---|---|---|
| Agent-first operating model (humans steer, agents execute) | Partial | The repo explicitly describes this model in `README.md` and `docs/operating-model/agent-operating-model.md`. | We do not have enforceable proof that all code is agent-generated or that humans never commit hand-written code. |
| Structured PR lifecycle with risk gates | Mostly yes | `docs/playbooks/pr-lifecycle.md` defines preflight gates, review loops, SHA freshness, and remediation flow. `risk-policy.contract.json` encodes risk-tier policy. | Some checks referenced in policy are placeholders or not wired as strict blockers in all workflows. |
| Mechanical policy enforcement in CI | Partial | `.github/workflows/risk-policy-gate.yml` and `.github/workflows/ci.yml` run risk gate + build/test. `packages/config` implements docs drift and SHA checks. | Lint/security-scan are not substantive yet (`npm run lint` is placeholder), and CI does not currently run a dedicated security scan. |
| Agent-to-agent review loop and stale-SHA handling | Mostly yes | `tools/review-loop` and `packages/config/src/sha-discipline.ts` implement stale-SHA rejection, rerun behavior, and auto-resolve logic. | Operational integration with external review agent quality gates should be validated continuously in real PR traffic. |
| UI legibility and browser evidence | Partial | Policy requires browser evidence for high-risk changes (`risk-policy.contract.json`), and there is a pre-PR script (`scripts/harness-ui-pre-pr.sh`). | Capture/verify commands are placeholders in `package.json`; no actual DOM/screenshot/video harness exists yet. |
| Observability stack available to agents (logs/metrics/traces queryable in dev) | No / minimal | `observability/` exists with runbook scaffolding. | No local vector + logs/metrics/traces stack, no LogQL/PromQL/TraceQL query tooling, and no agent-accessible observability loop. |
| Docs as system of record with map-like AGENTS | Partial | Repo has `AGENTS.md` + docs structure and architecture docs. | Compared to the article, knowledge base is smaller and lacks strong freshness/cross-link validation or doc-gardening automation. |
| Continuous cleanup / entropy management | Partial | There are quality-oriented scripts and policy contracts. | No scheduled refactor/cleanup bot workflow evidenced for ongoing "garbage collection" of patterns. |
| End-to-end autonomous feature loop (repro bug, capture video, fix, verify, PR, merge) | No (not yet) | Individual building blocks exist (review loop abstractions, risk policy, scripts). | Missing robust app runtime + browser/video harness + failure recovery orchestration to prove full autonomy. |

## Practical conclusion
If the question is "do we do all of this?", the answer is **no**.

If the question is "are we directionally aligned with this operating model?", the answer is **yes, partially**: we have foundational scaffolding for policy-gated, agent-first development, but several high-leverage capabilities (real browser evidence pipeline, full observability loop, non-placeholder lint/security gates, autonomous end-to-end execution) are still incomplete.

## Recommended next steps
1. Replace placeholder UI evidence commands with a real browser harness (screenshots/video + manifest validation).
2. Introduce real lint + security scan jobs and enforce them in CI.
3. Add local ephemeral observability stack and query helpers for agent runtime.
4. Add recurring doc-gardening and entropy-reduction automation workflows.
5. Track a single "autonomy maturity" scorecard in `docs/analysis/` and update it weekly.

## Observability impact
This assessment is documentation-only and introduces **no runtime observability changes**.
