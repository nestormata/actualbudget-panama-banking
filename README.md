# bank-actualbudget-sync

Automated bank transaction scraper that imports transactions from GlobalBank Panama (and future banks) into a self-hosted [ActualBudget](https://actualbudget.org/) instance.

Built with Playwright, TypeScript, and Docker.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  bank-sync container                                │
│                                                     │
│  Scheduler (node-cron)                              │
│      │                                              │
│      ▼                                              │
│  SyncOrchestrator ──► SyncPipeline (per bank)       │
│                           │                         │
│                    BankConnector                    │
│                    (Playwright scraper)             │
│                           │                         │
│                    normalizeTransactions             │
│                           │                         │
│                    ActualBudgetImporter             │
│                    (@actual-app/api)                │
└─────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Each bank is a self-contained `BankConnector` implementation
- Transactions are deduplicated via stable SHA-256 `imported_id` — reruns are safe
- Bank failures are isolated — one failing bank won't stop others
- Health status written to `/tmp/sync-status.json` for Docker healthcheck

---

## Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- A running [ActualBudget](https://actualbudget.org/) instance reachable by Docker network

---

## First-time setup

### 1. Copy and fill in the config

```bash
cp config.example.json config.json
```

Edit `config.json` with your ActualBudget server URL, budget file sync ID, and your bank account mappings. See [Configuration reference](#configuration-reference) below.

### 2. Create the `.env` file

```bash
cat > .env <<'EOF'
GLOBALBANK_USER=your_username
GLOBALBANK_PASS=your_password
ACTUAL_PASSWORD=your_actualbudget_password
EOF
```

### 3. Build the production image

```bash
docker compose build bank-sync
```

---

## Running a manual sync

```bash
docker compose run --rm bank-sync node dist/main.js --run-once
```

This runs one full sync cycle (all banks → all mapped accounts → import) and exits.

---

## Running as a daemon (scheduled)

```bash
docker compose up -d bank-sync
```

The container starts the cron scheduler using the `syncIntervalCron` value from `config.json`. Default is every 6 hours.

Check that it is running:

```bash
docker compose ps bank-sync
docker compose logs -f bank-sync
```

---

## Inspecting logs

The service uses structured JSON logging (via [pino](https://getpino.io)). To pretty-print locally:

```bash
docker compose logs -f bank-sync | npx pino-pretty
```

Or add `pino-pretty` as the log processor in docker-compose.yml.

---

## Checking sync health

The container writes a health status file after each sync cycle:

```bash
docker compose exec bank-sync cat /tmp/sync-status.json
```

The Docker healthcheck reads this file automatically and marks the container unhealthy if no sync has run in `2 × syncIntervalCron`.

---

## Configuration reference

`config.json` structure:

```json
{
  "actualBudget": {
    "serverUrl": "http://actual-server:5006",
    "password": "...",
    "syncId": "your-budget-uuid"
  },
  "syncIntervalCron": "0 */6 * * *",
  "banks": [
    {
      "id": "globalbank",
      "enabled": true,
      "credentials": {
        "username": "${GLOBALBANK_USER}",
        "password": "${GLOBALBANK_PASS}"
      },
      "accounts": [
        {
          "bankAccountId": "50332008399",
          "actualAccountId": "actual-account-uuid"
        }
      ]
    }
  ]
}
```

| Field | Description |
|---|---|
| `actualBudget.serverUrl` | URL of your ActualBudget server |
| `actualBudget.syncId` | Budget file sync ID (from ActualBudget settings) |
| `syncIntervalCron` | Cron expression for automatic sync schedule |
| `banks[].id` | Bank identifier — must match a registered connector (`globalbank`) |
| `banks[].enabled` | Set `false` to skip a bank without removing it |
| `banks[].accounts[].bankAccountId` | Account number as shown in the bank portal |
| `banks[].accounts[].actualAccountId` | UUID of the matching account in ActualBudget |

All credential values can reference environment variables using `${VAR_NAME}` syntax.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GLOBALBANK_USER` | Yes | GlobalBank portal username |
| `GLOBALBANK_PASS` | Yes | GlobalBank portal password |
| `ACTUAL_PASSWORD` | Yes | ActualBudget server password |
| `LOG_LEVEL` | No | Pino log level (`debug`, `info`, `warn`, `error`). Default: `info` |
| `ACTUAL_NETWORK_NAME` | No | Docker network name where ActualBudget is running. Default: `actualbudget_default` |

---

## Adding a new bank

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Development

### Running tests

```bash
# Unit tests (fast, no browsers)
docker compose run --rm dev npm run test:unit

# Fixture tests (require Playwright browser)
docker compose run --rm playwright npm run test:fixture

# Integration tests (require live ActualBudget)
ACTUAL_SERVER_URL=http://localhost:5006 ACTUAL_PASSWORD=... ACTUAL_SYNC_ID=... \
  docker compose run --rm dev npm run test:integration

# All tests
docker compose run --rm dev npm test
```

### Lint & build

```bash
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run build
```

### Re-capturing HTML fixtures

If the bank portal changes and parser tests break, re-capture fixtures:

```bash
GLOBALBANK_USER=... GLOBALBANK_PASS=... \
  docker compose run --rm playwright node scripts/capture-fixtures.mjs
```
