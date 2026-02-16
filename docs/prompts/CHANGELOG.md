# Prompt Registry Changelog

## 2026-02-16
- Added versioned prompt registry at `docs/prompts/registry.json`.
- Added task-class prompt templates (`planning`, `code-edit`, `review`, `summarization`, `remediation`) at `v1`.
- Added rollback policy: each mapping includes `rollbackVersion`, and runtime can switch to that version if regressions are detected.
