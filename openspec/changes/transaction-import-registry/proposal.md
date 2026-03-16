## Why

When a user deletes a transaction from ActualBudget (e.g. to reassign it to a different budget period), the next sync re-imports it because ActualBudget's own idempotency check only works against transactions still present in the budget. A local registry independent of ActualBudget is needed to permanently track which transactions have already been imported.

## What Changes

- **New**: One plain text file per account (`data/<bankId>/<accountId>.txt`) storing one transaction ID per line, capped at the last 1000 entries (oldest rotated out).
- **New**: Before importing, transactions whose IDs are already in the account's registry file are filtered out and never sent to ActualBudget again.
- **New**: A CLI flag `--clear-registry` (with optional `--bank <bankId>` and `--account <accountId>` filters) to delete registry files and force a full re-import on next run.
- **Modified**: `ActualBudgetImporter.importTransactions()` consults and updates the registry around each import batch.
- **Modified**: The `ImportResult` type gains a `deduplicated` count (transactions skipped by the registry).

## Capabilities

### New Capabilities
- `import-registry`: One plain text file per account (`data/<bankId>/<accountId>.txt`) tracking the last 1000 imported transaction IDs; supports lookup, append-with-rotation, and clear operations (all accounts, by bank, or by single account).

### Modified Capabilities
- *(none — no existing spec files found)*

## Impact

- **No new dependencies** — uses Node.js `fs` only.
- **New file**: `src/importer/import-registry.ts` — registry class.
- **Modified**: `src/importer/actualbudget.importer.ts` — accepts and uses registry.
- **Modified**: `src/orchestrator/sync.pipeline.ts` — initialises registry and passes it to importer.
- **Modified**: `src/main.ts` — parses `--clear-registry` CLI arg.
- **New volume mount** in `docker-compose.yml`: `/app/data` for the registry file.
- **No breaking changes** to connector interface or config format.
