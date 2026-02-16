# PR Lifecycle Playbook

1. Generate implementation plan from issue template.
2. Implement changes in scoped branch/worktree.
3. Run local checks (`lint`, `test`, `build`).
4. **Risk-tier gate** (`npm run harness:risk-tier`):
   - Compute adaptive risk score/tier from changed files using contract, semantic signals, and `risk-signals.metadata.json` historical inputs.
   - Emit risk explanation payload (triggered signals + score breakdown) for CI auditability.
   - Verify docs-drift rules (control-plane and path-class coverage require aligned doc updates across architecture, operating model, playbooks, and runbooks).
   - For high-tier changes: require code-review-agent clean state at current head SHA.
   - For UI/flow changes: require browser evidence (`npm run harness:ui:pre-pr`).
5. Request agent review loop and resolve feedback.
   - Review state must match the current PR head commit SHA.
   - Stale review summaries tied to older SHAs are ignored per reviewer provider.
   - Reviewer outputs (style/security/architecture) are normalized into a shared finding schema.
   - Duplicate findings are adjudicated by severity + confidence before remediation.
   - Provider-specific rerun workflows are triggered with SHA-deduped comments.
   - Bot-only threads auto-resolve after clean current-head rerun.
6. If actionable findings exist, remediate in-branch and rerun deterministically.
7. Merge after all required checks pass and rollout steps are documented.

## Linting policy

`npm run lint` is a required gate that now runs both ESLint and repository custom lints.

- **ESLint**: baseline syntax and correctness linting across TypeScript/JavaScript.
- **Custom lints**:
  - Domain/layer dependency direction (`apps -> packages`, `tools -> {tools, packages}`, `packages -> packages`).
  - Structured logging in source modules (no direct `console.*` calls in `*/src/**`).
  - Kebab-case file naming with optional `.test` suffix.
  - Source file size budget (max 250 lines per `*/src/**` module).

All custom lint findings include an `Agent remediation:` instruction so automated contributors
can apply deterministic, low-friction fixes.

## CI security

The `ci.yml` workflow uses `permissions: contents: read` (least-privilege) to
limit the `GITHUB_TOKEN` scope for all jobs.

## Observability impact notes

Lint policy now treats structured logging as a release gate. This keeps runtime and CLI logs
machine-parseable for dashboarding and runbook analysis, reducing investigation latency during
incident response.

## Harness gap loop

When production regressions occur:
```
production regression → harness-gap issue → case added → SLA tracked
```

Convert incidents into harness test cases to grow long-term coverage.

## Observability impact

- CI now logs `risk-score` and serialized risk explanation output so reviewers can trace why a PR was classified as `high` or `low`.
- Keep `risk-signals.metadata.json` current with flaky/incident/rollback tags to preserve signal quality over time.
- Track `review_findings_total` by `provider`, `severity`, and `category` to identify noisy reviewer channels.
- Track `review_findings_adjudicated_total` and `review_findings_deduplicated_total` to validate conflict-resolution quality.
- Track `review_rerun_requests_total` by provider workflow to detect stuck rerun pipelines.

## Docs integrity checker

Run `pnpm dlx tsx scripts/check-docs-integrity.ts --max-age-days 90` before opening PRs that touch control-plane, runtime, or ops docs.

Back to [Documentation Index](../README.md).
