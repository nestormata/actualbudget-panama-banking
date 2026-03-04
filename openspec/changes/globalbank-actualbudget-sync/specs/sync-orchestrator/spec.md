## ADDED Requirements

### Requirement: Full sync pipeline execution
The orchestrator SHALL execute the full sync pipeline for each configured bank: (1) instantiate and connect the bank connector, (2) fetch configured accounts' transactions for the configured `daysToFetch` window ending at today, (3) normalize raw transactions to `CanonicalTransaction[]`, (4) pass them to the importer, (5) disconnect the connector. Each step SHALL be awaited sequentially within a bank; banks MAY run concurrently if multiple are configured.

#### Scenario: Single bank full pipeline runs end-to-end
- **WHEN** the orchestrator runs with one bank configured
- **THEN** it SHALL call `connect()`, `getTransactions()`, `normalize()`, `import()`, and `disconnect()` in order without error

#### Scenario: Disconnect is called even when pipeline throws
- **WHEN** the importer throws during the pipeline
- **THEN** the connector's `disconnect()` SHALL still be called (finally block pattern)

---

### Requirement: Per-bank error isolation
If the full pipeline for one bank throws an unrecoverable error, the orchestrator SHALL catch it, log it with structured context (`bankId`, error message, stack trace), and continue processing remaining banks. After all banks have been attempted, the orchestrator SHALL report an overall failure status if any bank failed.

#### Scenario: Second bank runs after first bank fails
- **WHEN** the pipeline for bank A throws `AuthError` and bank B is also configured
- **THEN** bank B's pipeline SHALL still execute and the orchestrator SHALL complete with a partial-failure status

---

### Requirement: Configurable cron-based scheduling
The orchestrator SHALL read a cron expression from `config.json` (`syncIntervalCron` field) and schedule recurring sync runs using that expression. The default cron SHALL be `"0 8 * * *"` (daily at 08:00 local time). The scheduler SHALL begin immediately on container start and execute the first run at the next matching cron time. A manual one-shot trigger SHALL also be available via a CLI entry point (`sync-now`).

#### Scenario: Cron schedule triggers a sync
- **WHEN** the configured cron expression fires
- **THEN** the orchestrator SHALL initiate a full sync pipeline run for all configured banks

#### Scenario: sync-now CLI runs immediately
- **WHEN** `node dist/cli/sync-now.js` is executed
- **THEN** the orchestrator SHALL run one complete sync cycle and exit with code 0 on success or code 1 on failure

---

### Requirement: Structured logging
All log output SHALL be structured JSON (using a logger such as `pino`). Every log entry SHALL include: `timestamp` (ISO 8601), `level` (info/warn/error), `bankId` (when within a bank context), `accountId` (when within an account context), and `message`. Credentials and personal data SHALL NEVER appear in log output. Log level SHALL be configurable via the `LOG_LEVEL` environment variable (default: `info`).

#### Scenario: Successful sync produces info-level log
- **WHEN** a bank sync completes successfully
- **THEN** a log entry at level `info` SHALL be emitted with `bankId`, `accountId`, and `transactionsImported` count

#### Scenario: Auth failure produces error-level log with bankId
- **WHEN** a connector throws `AuthError`
- **THEN** a log entry at level `error` SHALL be emitted containing `bankId` and the error message but NOT the password

#### Scenario: Log level filtering respects LOG_LEVEL
- **WHEN** `LOG_LEVEL=error` is set
- **THEN** info and warn entries SHALL NOT be emitted to stdout

---

### Requirement: Health status file
The orchestrator SHALL write a JSON health status file to `/tmp/sync-status.json` after each sync run. The file SHALL contain: `lastRunAt` (ISO 8601), `status` (`success` | `partial` | `failure`), and a `banks` array with per-bank `bankId`, `status`, `accountsSynced`, `transactionsImported`, and `error` (if failed). Docker or an external monitor MAY read this file for health checks.

#### Scenario: Status file written after successful run
- **WHEN** all banks sync successfully
- **THEN** `/tmp/sync-status.json` SHALL be written with `status: "success"` and each bank showing `status: "success"`

#### Scenario: Status file written after partial failure
- **WHEN** one bank fails and one succeeds
- **THEN** `/tmp/sync-status.json` SHALL show top-level `status: "partial"` with individual bank entries reflecting each outcome

---

### Requirement: Graceful shutdown
The orchestrator SHALL handle `SIGTERM` and `SIGINT` signals by canceling any pending scheduled runs (not interrupting a run already in progress) and exiting with code 0. A run already in progress at shutdown time SHALL be allowed to complete before the process exits.

#### Scenario: SIGTERM during idle period exits cleanly
- **WHEN** `SIGTERM` is received while the orchestrator is waiting for the next cron tick
- **THEN** the process SHALL exit with code 0 without starting a new sync

#### Scenario: SIGTERM during active sync waits for completion
- **WHEN** `SIGTERM` is received while a sync pipeline is running
- **THEN** the current pipeline SHALL complete and only then SHALL the process exit
