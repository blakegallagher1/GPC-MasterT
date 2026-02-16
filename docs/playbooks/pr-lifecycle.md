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

## Security check remediation loop

When `npm run security-scan` fails in CI:

1. Download `security-scan-report` artifact and inspect `artifacts/security/security-scan-report.json`.
2. Review `artifacts/security/security-scan-summary.md` in the job summary for quick triage.
3. Remediate findings by priority:
   - **npm audit findings**: update/replace vulnerable packages, then rerun scan.
   - **semgrep findings**: patch the flagged code paths and add/extend tests.
4. If a temporary exception is required, add an `ignores` entry in `security/security-scan-policy.json` with:
   - tool + finding identifier (`id` or `ruleId` + optional `path`),
   - remediation ticket in `reason`,
   - a near-term `expiresOn` date.
5. Expired ignores fail the scan by design. Renew only with explicit owner approval and updated remediation ETA.
6. Rerun `npm run security-scan`, then rerun full CI gates (`lint`, `test`, `build`, `security-scan`) before merge.

