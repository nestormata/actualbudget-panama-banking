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
GLOBALBANK_USER=your_globalbank_username
GLOBALBANK_PASS=your_globalbank_password
BGENERAL_USER=your_bgeneral_username
BGENERAL_PASS=your_bgeneral_password
BGENERAL_SECURITY_QA=[{"pattern":"regex1","answer":"answer1"},{"pattern":"regex2","answer":"answer2"}]
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

`config.json` structure (see `config.example.json` for a complete template):

```json
{
  "syncIntervalCron": "0 */6 * * *",
  "banks": [
    {
      "bankId": "globalbank-pa",
      "accounts": [
        {
          "bankAccountId": "50332008399",
          "actualBudgetAccountId": "actual-account-uuid",
          "daysToFetch": 30
        }
      ]
    }
  ]
}
```

| Field | Description |
|---|---|
| `syncIntervalCron` | Cron expression for automatic sync schedule |
| `banks[].bankId` | Bank identifier — must match a registered connector (`globalbank-pa`) |
| `banks[].accounts[].bankAccountId` | Account number as shown in the bank portal |
| `banks[].accounts[].actualBudgetAccountId` | UUID of the matching account in ActualBudget |
| `banks[].accounts[].daysToFetch` | How many past days of transactions to fetch (default: 30) |

ActualBudget connection settings are provided via environment variables (see below).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GLOBALBANK_USER` | Yes* | GlobalBank portal username |
| `GLOBALBANK_PASS` | Yes* | GlobalBank portal password |
| `BGENERAL_USER` | Yes* | Banco General portal username |
| `BGENERAL_PASS` | Yes* | Banco General portal password |
| `BGENERAL_SECURITY_QA` | Yes* | JSON array of `{ "pattern": "<regex>", "answer": "<answer>" }` pairs. The connector logs the exact question text (field `securityQuestion`) at `info` level on every login and at `warn` level when no pattern matches — use those log entries to craft or update your regex patterns. |
| `ACTUAL_SERVER_URL` | Yes | ActualBudget server URL (e.g. `http://actual-budget:5006`) |
| `ACTUAL_PASSWORD` | Yes | ActualBudget server password |
| `ACTUAL_SYNC_ID` | Yes | Budget sync ID (the `group_id` from ActualBudget's Advanced settings) |
| `LOG_LEVEL` | No | Pino log level (`debug`, `info`, `warn`, `error`). Default: `info` |
| `ACTUAL_NETWORK_NAME` | No | Docker network name where ActualBudget is running. Default: `actualbudget_default` |

> \* Only required if that bank is configured in `config.json`.

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
