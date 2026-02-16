# Documentation Quality Scorecard

This scorecard tracks measurable freshness and completeness for canonical docs.

## Metrics

| Metric | Target | Current | How measured |
|---|---:|---:|---|
| Required indexes present | 100% | 100% (6/6) | `scripts/check-docs-integrity.ts` validates required index files. |
| Markdown files with backlink to canonical index | 100% | 100% | `scripts/check-docs-integrity.ts` scans docs + runbooks for `Back to` backlink text. |
| Broken local markdown references | 0 | 0 | Local markdown links are resolved and checked for file existence. |
| Stale markdown files (age > 90 days) | 0 | Tracked weekly | Git commit timestamps are used as last-reviewed proxy. |
| Docs coverage for control-plane changes | 100% | Enforced in policy | `docsDriftRules.coverageByPathClass` in risk policy contract gates PRs. |

## Weekly gardening workflow

- Schedule: every Monday (`.github/workflows/docs-gardening.yml`).
- Actions:
  1. Run docs integrity checker.
  2. Regenerate stale-docs report.
  3. Open/update a PR with scorecard-adjacent stale content report.

## Scoring formula

```
quality_score =
  25 * index_coverage_ratio +
  25 * backlink_coverage_ratio +
  25 * (1 - broken_reference_ratio) +
  25 * (1 - stale_docs_ratio)
```

Where each ratio is normalized to `[0,1]`.

Back to [Documentation Index](./README.md).
