## Context

The current importer uses ActualBudget's `imported_id` field for idempotency. This only prevents duplicates while the transaction exists in ActualBudget — once a user deletes a transaction, ActualBudget loses the record and re-imports it on the next sync. A local registry that persists independently of ActualBudget solves this.

## Goals / Non-Goals

**Goals:**
- Track every successfully imported transaction ID locally, per account
- Filter already-imported transactions before sending to ActualBudget
- Rotate each file to keep the last 1000 IDs (bounded disk usage)
- Allow clearing the registry for all accounts, one bank, or one account

**Non-Goals:**
- Tracking transaction metadata beyond the ID
- Cross-run reporting or audit logs
- Replacing ActualBudget's own `imported_id` deduplication (both layers stay)

## Decisions

### One file per account (`data/<bankId>/<accountId>.txt`)
**Rationale:** Isolates accounts so clearing one doesn't affect others. Makes it trivial to inspect or clear a specific account's history with standard file tools. Flat text — one ID per line — readable without tooling.

**Alternatives considered:**
- Single global file: simpler but clearing per-account requires parsing
- SQLite: more powerful but adds complexity and a dependency; overkill for a list of IDs

### Rotate at 1000 entries (keep last 1000)
**Rationale:** Bounds file size. 1000 covers ~3 months of daily transactions for active accounts with headroom. On rotation, oldest entries are dropped — acceptable since transactions older than the fetch window will never reappear from the scraper anyway.

### Registry owned by `ImportRegistry` class, injected into importer
**Rationale:** Keeps the registry logic testable in isolation. `ActualBudgetImporter` receives it as a constructor dependency — easy to swap with a no-op in tests.

### `--clear-registry` CLI flag with optional `--bank` / `--account` filters
**Rationale:** Gives operators a safe escape hatch. Without filters, clears all. With `--bank bgeneral-pa`, clears all files under `data/bgeneral-pa/`. With both flags, clears one specific file.

## Risks / Trade-offs

- **Rotation drops old IDs** → If `daysToFetch` is extended beyond the rotation window, stale transactions could re-appear. Mitigation: 1000 entries is well above any realistic fetch window.
- **File corruption** (partial write) → On load, skip any line that isn't a valid 64-char hex string. Mitigation: write to a `.tmp` file and rename atomically.
- **Disk persistence** → If the Docker volume is lost, the registry is lost and all transactions re-import once. Mitigation: document the volume; ActualBudget's own `imported_id` will deduplicate anything already present.

## Migration Plan

1. On first run after deploy, `data/` directory is empty → all transactions import normally and registry is populated
2. No config changes required
3. Rollback: remove `data/` volume mount — registry is simply ignored (feature is additive)
