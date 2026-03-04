## Context

Panamanian banks expose no public API or Open Banking standard. The only way to extract transaction data programmatically is via browser automation against their web portals. GlobalBank Panama's portal (`globalonline.globalbank.com.pa`) is a legacy Java EE application (IE=EmulateIE7) protected by Imperva Incapsula, with a two-step form login (username first, password second) and CSRF tokens.

ActualBudget runs as a Docker container on a Proxmox home server (private LAN with internet access). The official `@actual-app/api` Node.js library provides programmatic access to ActualBudget's budget files.

The system is greenfield — no existing code to migrate. Multiple banks will be added over time; architecture must support that from the start.

## Goals / Non-Goals

**Goals:**
- Automated, scheduled extraction of transactions from GlobalBank Panama
- Clean pluggable interface so new bank connectors can be added with zero changes to shared code
- Import transactions into ActualBudget without duplicates (idempotent)
- Docker Compose deployment on the same host as ActualBudget
- Test-driven development: unit tests for all business logic, integration tests for importer, scraper tested against page fixtures

**Non-Goals:**
- Real-time / webhook-based sync (periodic polling is sufficient)
- Supporting Open Banking APIs (banks don't offer them)
- Mobile app or web UI for this service
- Supporting ActualBudget's SaaS/cloud version (only self-hosted)
- Automating transfers between accounts or initiating payments

## Decisions

### 1. Runtime: Node.js + TypeScript

**Chosen**: Node.js 22 LTS with TypeScript (strict mode).

**Rationale**: `@actual-app/api` is a Node.js library with no official ports. Playwright's Node.js SDK is the most mature and best-documented. TypeScript strict mode catches interface mismatches between connectors at compile time — critical for a multi-bank system.

**Alternatives considered**: Python (good Playwright support, but `@actual-app/api` would require a subprocess bridge or unofficial port); Bun (faster, but less ecosystem maturity for Playwright + Docker).

---

### 2. Browser automation: Playwright

**Chosen**: Playwright with Chromium.

**Rationale**: Playwright has built-in retry/wait-for mechanisms, strong TypeScript types, and a `page.locator()` API that encourages resilient selectors (by role/text rather than fragile CSS classes). It is actively maintained and has first-class Docker support via `mcr.microsoft.com/playwright` base images.

**Alternatives considered**: Puppeteer (same engine, weaker API); Selenium (heavier, slower, dated); `axios` + HTML parsing (GlobalBank's portal is JavaScript-rendered and session-based, making headless HTTP insufficient).

---

### 3. Multi-bank architecture: Connector Registry pattern

**Chosen**: Each bank implements a `BankConnector` interface. Connectors are registered in a `ConnectorRegistry` keyed by a `bankId` string. The orchestrator iterates configured banks, resolves each connector from the registry, and runs the pipeline.

```
BankConnector (interface)
    └── GlobalBankConnector   ← first implementation
    └── <NextBankConnector>   ← future, zero shared-code changes needed

ConnectorRegistry
    .register(bankId, connector)
    .get(bankId): BankConnector
```

**Rationale**: Adding a bank = write one class + register it. No changes to importer, orchestrator, scheduler, or Docker setup. TypeScript's interface system enforces the contract at compile time.

**Alternatives considered**: Dynamic plugin loading from file system (too complex, no type safety); monolithic switch-case (doesn't scale, violates open/closed principle).

---

### 4. Canonical transaction format

**Chosen**: A shared `CanonicalTransaction` type with fields:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable hash derived from `bankId + accountId + date + amount + payee` |
| `bankId` | `string` | e.g. `globalbank-pa` |
| `accountId` | `string` | Bank-side account identifier |
| `date` | `string` | ISO 8601 (`YYYY-MM-DD`) |
| `amount` | `number` | Integer cents (negative = debit) |
| `payee` | `string` | Merchant / counterparty name |
| `notes` | `string \| null` | Raw description from bank |

**Rationale**: The importer and orchestrator only deal with `CanonicalTransaction[]`. Each connector is responsible for transforming its raw data. Amount in cents avoids floating-point bugs.

---

### 5. Idempotency: content-based stable IDs

**Chosen**: Generate the transaction `id` as a SHA-256 hash of `${bankId}:${accountId}:${date}:${amount}:${payee}`. Pass this as `importedId` to `@actual-app/api` — ActualBudget's API deduplicates by `importedId`.

**Rationale**: GlobalBank's portal does not expose stable transaction reference IDs in the HTML. A content-based hash is reproducible across sync runs for the same transaction, providing idempotency without a local database.

**Risk**: Two transactions on the same day for the same amount to the same payee will hash-collide. This is rare but possible (e.g. two identical coffee purchases). Mitigation: append a positional index within the day's results for that account as a tiebreaker.

---

### 6. Configuration: `.env` (secrets) + `config.json` (structure)

**Chosen**: Environment variables for all secrets (credentials, encryption keys). A `config.json` file (mounted into the container) for account mappings and schedule configuration.

```jsonc
{
  "syncIntervalCron": "0 8 * * *",   // daily at 08:00
  "banks": [
    {
      "bankId": "globalbank-pa",
      "accounts": [
        {
          "bankAccountId": "001-123456-7",
          "actualBudgetAccountId": "abc123",
          "daysToFetch": 30
        }
      ]
    }
  ]
}
```

**Rationale**: Separating secrets from structure means `config.json` can be committed (no secrets), while `.env` is gitignored. Docker Compose can inject env vars directly.

---

### 7. Testing strategy: TDD with Jest

**Chosen**: Jest + `ts-jest` for all tests. Three layers:

| Layer | Scope | Tools |
|---|---|---|
| **Unit** | Business logic: normalizer, idempotency, registry, config loader | Jest + pure TypeScript |
| **Integration** | ActualBudget importer against a real local ActualBudget instance | Jest + `@actual-app/api` (in-memory budget) |
| **Fixture-based** | Scraper HTML parsing against saved portal HTML snapshots | Jest + Playwright (`page.setContent()`) |

End-to-end tests against the live GlobalBank portal are excluded from CI (require real credentials) and documented as a manual smoke test.

**Rationale**: TDD ensures the connector interface, canonical type, and idempotency logic are correct before any real browser automation is written. Fixture-based scraper tests let the parser be developed and regression-tested without network access.

---

### 8. Docker: single container, multi-stage build

**Chosen**: Use `mcr.microsoft.com/playwright:v1.x-noble` as the base image (includes Chromium + system deps). Multi-stage TypeScript build (compile → copy dist). Docker Compose service connects to the same network as ActualBudget.

**Rationale**: Playwright's official Docker image eliminates painful Chromium dependency installation. Multi-stage build keeps the final image small. Sharing a Docker network lets the sync service reach ActualBudget by service name (`http://actual-budget:5006`).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| GlobalBank portal HTML changes (CSS classes, form structure) → scraper breaks | Use Playwright locators by visible text and ARIA role rather than CSS classes; add a startup health-check that alerts on selector failures |
| Imperva Incapsula bot detection blocks Playwright | Use Playwright's full Chromium browser (not headless by default in Docker); add realistic inter-action delays; set a real User-Agent |
| Login requires OTP / security challenge | Detect challenge page and surface a clear error; document manual OTP handling; future enhancement to support SMS OTP via Twilio |
| `@actual-app/api` version mismatch with running ActualBudget | Pin `@actual-app/api` semver to match ActualBudget container version; document upgrade procedure in README |
| Hash collision on identical same-day transactions | Append a per-day positional index as described in Decision 5 |
| Credentials in environment variables could leak in logs | Redact env vars in all log output; never log request bodies |

## Migration Plan

This is a greenfield deployment — no migration required.

**Rollout steps:**
1. Build and test the Docker image locally
2. Add the service to the existing `docker-compose.yml` on the Proxmox host
3. Configure `config.json` and `.env` (not committed)
4. Run first manual sync with `docker compose run --rm bank-sync node dist/cli/sync-now.js` and verify transactions in ActualBudget
5. Enable the scheduler by starting the service normally (`docker compose up -d bank-sync`)

**Rollback**: `docker compose stop bank-sync` — ActualBudget and all other services are unaffected.

## Open Questions

- Does GlobalBank's portal require OTP/token on every login, or only on new devices? (To be confirmed via manual inspection before implementing the auth flow)
- Does ActualBudget's Docker container expose its data directory on a volume the sync service can access, or must it go via the HTTP API? (Prefer HTTP API for isolation)
- What is the desired behavior when a bank account has no matching ActualBudget account configured? (Fail loudly vs. skip with warning — recommend: skip with warning)
