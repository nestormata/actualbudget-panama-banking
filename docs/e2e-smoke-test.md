# E2E Smoke Test Guide

This guide walks through verifying the full pipeline end-to-end with real credentials and a live ActualBudget instance.

---

## Prerequisites

- Production image built: `docker compose build bank-sync`
- ActualBudget server running and accessible
- A budget with at least one account already created in ActualBudget
- You know the ActualBudget account UUID (Settings → Advanced → Account ID)

---

## Step 1: Prepare the environment

```bash
# Create .env with real credentials
cat > .env <<'EOF'
GLOBALBANK_USER=your_globalbank_username
GLOBALBANK_PASS=your_globalbank_password
ACTUAL_PASSWORD=your_actualbudget_password
EOF
```

---

## Step 2: Prepare config.json

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "actualBudget": {
    "serverUrl": "http://actual-server:5006",
    "password": "${ACTUAL_PASSWORD}",
    "syncId": "paste-your-budget-sync-id-here"
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
          "actualAccountId": "paste-actual-account-uuid-here"
        }
      ]
    }
  ]
}
```

To find your budget sync ID: In ActualBudget, go to Settings → Advanced → Sync. Copy the "Sync ID" UUID.

---

## Step 3: Ensure Docker network connectivity

The `bank-sync` container connects to ActualBudget via Docker network. Check that the network exists:

```bash
docker network ls | grep actualbudget
```

If it doesn't exist (e.g., ActualBudget is running with a different network name), set:

```bash
echo "ACTUAL_NETWORK_NAME=your_network_name" >> .env
```

---

## Step 4: Run a one-shot sync

```bash
docker compose run --rm bank-sync node dist/main.js --run-once
```

Expected output (JSON logs):

```
{"level":30,"msg":"Loading configuration..."}
{"level":30,"bankId":"globalbank","msg":"Starting sync for bank"}
{"level":30,"bankId":"globalbank","msg":"Connecting to bank portal"}
{"level":30,"bankId":"globalbank","msg":"Login successful"}
{"level":30,"bankId":"globalbank","accountId":"50332008399","count":20,"msg":"Fetched transactions"}
{"level":30,"bankId":"globalbank","accountId":"50332008399","imported":20,"msg":"Imported transactions"}
{"level":30,"bankId":"globalbank","msg":"Disconnected from bank portal"}
{"level":30,"status":"success","msg":"Sync cycle complete"}
```

---

## Step 5: Verify in ActualBudget

1. Open your ActualBudget budget
2. Navigate to the mapped account
3. Confirm transactions appear with today's import date
4. Verify amounts, dates, and descriptions match what you see in the GlobalBank portal

---

## Step 6: Confirm idempotency

Run the sync again immediately:

```bash
docker compose run --rm bank-sync node dist/main.js --run-once
```

Check the logs — the `imported` count should be `0` (no duplicates created). Verify in ActualBudget that no duplicate transactions appeared.

---

## Step 7: Enable the scheduled daemon

```bash
docker compose up -d bank-sync
docker compose logs -f bank-sync
```

The first run will execute shortly after startup. Subsequent runs follow the `syncIntervalCron` schedule.

---

## Troubleshooting

### "sesión anterior activa" (previous session still active)

GlobalBank blocks concurrent logins. If a previous run crashed without logging out, wait 5 minutes before retrying.

### "ConfigError: Failed to parse config file"

Verify `config.json` exists and is valid JSON:

```bash
cat config.json | python3 -m json.tool
```

### "Cannot connect to ActualBudget"

Check network connectivity from inside the container:

```bash
docker compose run --rm --no-deps --entrypoint sh bank-sync -c "curl -s http://actual-server:5006/health"
```

If it fails, verify `ACTUAL_NETWORK_NAME` points to the correct Docker network.

### Fixture tests fail after portal changes

Re-capture HTML fixtures:

```bash
GLOBALBANK_USER=... GLOBALBANK_PASS=... \
  docker compose run --rm playwright node scripts/capture-fixtures.mjs
```

Then re-run fixture tests:

```bash
docker compose run --rm playwright npm run test:fixture
```
