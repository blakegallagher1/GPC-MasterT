# Analysis: Harness Engineering in an Agent-First World

## What they changed
- They started from an empty repository and let Codex create the initial scaffolding.
- They enforced a strict "no manually-written code" development model.
- Humans moved from implementation to **environment design, intent specification, and feedback-loop tuning**.
- Agent throughput scaled via strong repository conventions, self-review loops, and tool integration.

## Core principles extracted
1. **Agent-legible systems**: codebase structure, tooling, runtime artifacts, and UI state must be machine-readable.
2. **Depth-first capability building**: unblock repeatedly failing tasks by adding reusable skills and tooling.
3. **Review automation**: move review from human-heavy to agent-to-agent where possible.
4. **Feedback-rich loops**: local tests, CI, logs, metrics, screenshots, and DOM snapshots feed back into iteration.
5. **Human attention economy**: reserve humans for prioritization, acceptance criteria, and risk decisions.

## Implications for repository design
- Monorepo layout that separates apps, shared packages, infra, tooling, and skills.
- Built-in guidance (`AGENTS.md`, playbooks, runbooks) for deterministic agent behavior.
- First-class observability and testing directories to make validation explicit.
- Environment-aware infra layout (dev/staging/prod) for repeatable launches.
