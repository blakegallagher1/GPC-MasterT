# Prompt Rollback Procedure

1. Update `docs/prompts/registry.json` mapping for impacted `taskClass`.
2. Set `prompt.version` back to the known-good version, usually the mapping's `rollbackVersion`.
3. Re-run deterministic replay tests under `packages/agent-runtime/src/openai-integration.test.ts`.
4. Commit rollback as an isolated change and include incident context in commit message.
