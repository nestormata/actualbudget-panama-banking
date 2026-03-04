## Why

Panamanian banks (and banks in general) expose no public API or Open Banking interface, making it impossible to automatically pull account transactions into personal finance tools. Manually exporting and importing transactions into ActualBudget is time-consuming and error-prone. An automated, extensible sync platform removes that friction — starting with GlobalBank Panama and designed from day one to support additional banks without rearchitecting.

## What Changes

- **New**: A pluggable bank connector interface that any bank implementation must satisfy, enabling multiple banks to be supported in the same runtime
- **New**: A Playwright-based browser automation service with GlobalBank Panama as the first connector implementation
- **New**: A transformation layer that normalizes each bank's raw transaction fields into a shared canonical transaction format
- **New**: An ActualBudget importer that uses `@actual-app/api` to push normalized transactions and avoid duplicates
- **New**: A scheduler that triggers periodic syncs per bank/account on a configurable interval (e.g. daily)
- **New**: A Docker Compose service deployable alongside the existing ActualBudget Docker setup on the Proxmox home server
- **New**: Configuration via environment variables / config file: credentials per bank, ActualBudget connection details, and account-to-budget mappings

## Capabilities

### New Capabilities

- `bank-connector-interface`: Defines the shared contract (interface + canonical transaction type) that all bank connectors must implement, enabling the rest of the platform to be bank-agnostic
- `globalbank-scraper`: First concrete connector — Playwright-based browser automation that authenticates against GlobalBank Panama's legacy online banking portal (`globalonline.globalbank.com.pa`) and extracts transactions for one or more accounts
- `actualbudget-importer`: Receives normalized transaction records from any connector and imports them into ActualBudget using `@actual-app/api`, with idempotency to prevent duplicate entries
- `sync-orchestrator`: Coordinates the full pipeline — scrape → normalize → import — across all configured bank connectors on a configurable schedule, with per-bank logging and error reporting

### Modified Capabilities

<!-- None: this is a greenfield service -->

## Impact

- **New service**: `bank-actualbudget-sync` — a Node.js/TypeScript container hosting all bank connectors and the sync engine
- **Dependencies**: Playwright (Chromium), `@actual-app/api`, `node-cron` (or similar scheduler)
- **Infrastructure**: Deployed as a Docker Compose service on the same Proxmox host as ActualBudget; communicates with ActualBudget over the internal Docker/intranet network
- **Extensibility**: Adding a new bank requires only implementing the `bank-connector-interface` and registering it in config — no changes to the importer, orchestrator, or Docker setup
- **Credentials**: Per-bank credentials stored as Docker secrets / env vars (never committed)
- **Network**: Requires outbound internet access to reach each bank's portal
