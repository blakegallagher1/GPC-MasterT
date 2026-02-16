# PR Lifecycle Playbook

1. Generate implementation plan from issue template.
2. Implement changes in scoped branch/worktree.
3. Run local checks (`lint`, `test`, `build`).
4. **Risk-tier gate** (`npm run harness:risk-tier`):
   - Compute risk tier from changed files against `risk-policy.contract.json`.
   - Verify docs-drift rules (control-plane changes require doc updates).
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

## CI security

The `ci.yml` workflow uses `permissions: contents: read` (least-privilege) to
limit the `GITHUB_TOKEN` scope for all jobs.

## Harness gap loop

When production regressions occur:
```
production regression → harness-gap issue → case added → SLA tracked
```

Convert incidents into harness test cases to grow long-term coverage.

## Observability impact notes

- Track `review_findings_total` by `provider`, `severity`, and `category` to identify noisy reviewer channels.
- Track `review_findings_adjudicated_total` and `review_findings_deduplicated_total` to validate conflict-resolution quality.
- Track `review_rerun_requests_total` by provider workflow to detect stuck rerun pipelines.
