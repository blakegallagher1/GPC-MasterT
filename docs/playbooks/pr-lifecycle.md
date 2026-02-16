# PR Lifecycle Playbook

1. Generate implementation plan from issue template.
2. Implement changes in scoped branch/worktree.
3. Run local checks (`lint`, `test`, `build`).
4. **Risk-tier gate** (`npm run harness:risk-tier`):
   - Compute adaptive risk score/tier from changed files using contract, semantic signals, and `risk-signals.metadata.json` historical inputs.
   - Emit risk explanation payload (triggered signals + score breakdown) for CI auditability.
   - Verify docs-drift rules (control-plane changes require doc updates).
   - For high-tier changes: require code-review-agent clean state at current head SHA.
   - For UI/flow changes: require browser evidence (`npm run harness:ui:pre-pr`).
5. Request agent review loop and resolve feedback.
   - Review state must match the current PR head commit SHA.
   - Stale review summaries tied to older SHAs are ignored.
   - A single canonical workflow posts rerun requests (SHA-deduped).
   - Bot-only threads auto-resolve after clean current-head rerun.
6. If actionable findings exist, remediate in-branch and rerun deterministically.
7. Merge after all required checks pass and rollout steps are documented.

## CI security

The `ci.yml` workflow uses `permissions: contents: read` (least-privilege) to
limit the `GITHUB_TOKEN` scope for all jobs.

## Harness gap loop

When production regressions occur:
```
production regression → harness-gap issue → case added → SLA tracked
```

Convert incidents into harness test cases to grow long-term coverage.

## Observability impact

- CI now logs `risk-score` and serialized risk explanation output so reviewers can trace why a PR was classified as `high` or `low`.
- Keep `risk-signals.metadata.json` current with flaky/incident/rollback tags to preserve signal quality over time.
