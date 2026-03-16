## 1. ImportRegistry class

- [x] 1.1 Create `src/importer/import-registry.ts` with `ImportRegistry` class: constructor takes `dataDir` and `bankId`+`accountId` to resolve the file path (`data/<bankId>/<accountId>.txt`)
- [x] 1.2 Implement `load(): Set<string>` — reads file, splits lines, filters valid 64-char hex IDs, returns a Set
- [x] 1.3 Implement `save(ids: Set<string>): void` — serialises set to lines, trims to last 1000, writes atomically via `.tmp` + rename
- [x] 1.4 Implement `has(id: string): boolean` — returns whether ID is in the loaded set
- [x] 1.5 Implement `addAll(ids: string[]): void` — merges new IDs into the loaded set and calls `save()`
- [x] 1.6 Implement static `clear(dataDir, bankId?, accountId?): void` — deletes matching files; no error if files don't exist

## 2. Wire registry into importer

- [x] 2.1 Add `deduplicated` field to `ImportResult` type in `actualbudget.importer.ts`
- [x] 2.2 Add optional `registryDir` parameter to `ActualBudgetImporter` constructor (defaults to `/app/data`)
- [x] 2.3 In `importTransactions()`, for each account: load its registry, filter out already-seen transaction IDs, import the remainder, then call `addAll()` with the newly imported IDs
- [x] 2.4 Populate `result.deduplicated` with the count of filtered-out transactions

## 3. CLI flags

- [x] 3.1 Parse `--clear-registry`, `--bank <id>`, and `--account <id>` args in `src/main.ts` `parseArgs()`
- [x] 3.2 In `main()`, if `--clear-registry` is set: call `ImportRegistry.clear()` with optional filters, log the action, then proceed with sync (or exit if `--clear-registry` is the only intent — keep as proceed-then-sync for simplicity)

## 4. Docker volume

- [x] 4.1 Add `- ./data:/app/data` volume mount to the `bank-sync` service in `docker-compose.yml`
- [x] 4.2 Create `data/.gitkeep` and add `data/*.txt` / `data/**/*.txt` to `.gitignore`

## 5. Tests

- [x] 5.1 Unit test `ImportRegistry.load()`: empty file, valid IDs, malformed lines ignored
- [x] 5.2 Unit test `ImportRegistry.save()`: rotation at 1000, atomic write (`.tmp` replaced)
- [x] 5.3 Unit test `ImportRegistry.addAll()`: new IDs merged, rotation triggered correctly
- [x] 5.4 Unit test `ImportRegistry.clear()`: all, by bank, by account, no-op when missing
- [x] 5.5 Unit test importer deduplication: transactions in registry are excluded; `deduplicated` count is correct
