## 1. Project Bootstrap (files only — no host npm)

- [x] 1.1 Create `package.json` with all production and dev dependencies declared (TypeScript, ESLint, Prettier, Jest/ts-jest, Playwright, pino, node-cron, @actual-app/api, @typescript-eslint) and npm scripts: `build`, `test`, `test:unit`, `test:integration`, `test:fixture`, `lint`, `format:check`
- [x] 1.2 Create `tsconfig.json` with `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `outDir: dist`
- [x] 1.3 Create `tsconfig.build.json` extending `tsconfig.json`, excluding test files from production build
- [x] 1.4 Create `.eslintrc.json` using `@typescript-eslint/recommended` ruleset
- [x] 1.5 Create `.prettierrc` with project formatting rules
- [x] 1.6 Create `jest.config.ts` with three projects: `unit` (`tests/unit/**/*.test.ts`), `integration` (`tests/integration/**/*.test.ts`), `fixture` (`tests/fixture/**/*.test.ts`)
- [x] 1.7 Create base directory structure: `src/connectors/globalbank/parsers/`, `src/connectors/globalbank/fixtures/`, `src/importer/`, `src/orchestrator/`, `src/config/`, `src/cli/`, `src/shared/`, `tests/unit/`, `tests/integration/`, `tests/fixture/`, `docs/`
- [x] 1.8 Create `.gitignore` excluding `dist/`, `node_modules/`, `.env`, `*.db`, `actual-data/`
- [x] 1.9 Create `.env.example` documenting all required environment variables with placeholder values (no real secrets)

## 2. Docker Infrastructure (dev + production)

- [x] 2.1 Write multi-stage `Dockerfile`: builder stage uses `node:22-alpine` to compile TypeScript (`npm ci && npm run build`); runtime stage uses `mcr.microsoft.com/playwright:noble` and copies `dist/` and production `node_modules/`
- [x] 2.2 Create `docker-compose.yml` with a `dev` service: builds from the builder stage, mounts the project root as a volume (`./:/app`), sets `working_dir: /app`, used for all `npm install`, `npm run build`, and `npm test` commands via `docker compose run --rm dev <cmd>`
- [x] 2.3 Add the production `bank-sync` service to `docker-compose.yml`: builds from the runtime stage, `env_file: .env`, mounts `./config.json:/app/config.json:ro`, connects to the ActualBudget Docker network, `restart: unless-stopped`
- [x] 2.4 Configure `HEALTHCHECK` on the `bank-sync` service that reads `/tmp/sync-status.json` and fails if `lastRunAt` is older than 2× the `SYNC_INTERVAL_SECONDS` env var
- [x] 2.5 Run `docker compose run --rm dev npm install` to install all dependencies and validate the Docker setup works

## 3. Shared Types and Error Hierarchy (TDD)

- [x] 3.1 Write unit tests for `CanonicalTransaction` shape validation (correct fields, amount sign convention, ISO date format)
- [x] 3.2 Define `CanonicalTransaction` and `BankAccount` TypeScript types in `src/shared/types.ts`
- [x] 3.3 Write unit tests asserting `AuthError`, `NetworkError`, `ParseError`, and `ConnectorStateError` are distinguishable via `instanceof` and carry expected properties (`bankId`, `message`, etc.)
- [x] 3.4 Implement the typed error hierarchy in `src/shared/errors.ts` rooted at `BankConnectorError`
- [x] 3.5 Define the `BankConnector` interface in `src/shared/connector.interface.ts` with JSDoc on each method
- [x] 3.6 Run `docker compose run --rm dev npm run test:unit` — all new tests should fail (red), confirming they are wired up

## 4. Stable Transaction ID Generation (TDD)

- [x] 4.1 Write unit tests for `generateTransactionId()`: same inputs → same output, collision tiebreaker for identical same-day transactions, different amounts → different IDs
- [x] 4.2 Implement `generateTransactionId(fields, index?)` in `src/shared/transaction-id.ts` using Node.js `crypto.createHash('sha256')`
- [x] 4.3 Write unit tests for `normalizeTransactions(raw[], bankId, accountId)`: date parsing (`DD/MM/YYYY` → ISO), amount parsing (comma-thousands, sign), correct ID assignment
- [x] 4.4 Implement `normalizeTransactions()` in `src/shared/normalize.ts`
- [x] 4.5 Run `docker compose run --rm dev npm run test:unit` — all shared tests should pass (green)

## 5. Connector Registry (TDD)

- [x] 5.1 Write unit tests for `ConnectorRegistry`: register, get existing, get unregistered (throws listing registered IDs)
- [x] 5.2 Implement `ConnectorRegistry` as a class with `register(bankId, factory)` and `get(bankId)` in `src/shared/connector-registry.ts`
- [x] 5.3 Write unit test verifying a mock connector registered in the registry can be retrieved and satisfies the `BankConnector` interface at compile time
- [x] 5.4 Run `docker compose run --rm dev npm run test:unit` — registry tests pass

## 6. Configuration Loader (TDD)

- [x] 6.1 Write unit tests for `loadConfig()`: valid config parses correctly, missing required field throws `ConfigError`, unknown bankId in config warns but does not throw
- [x] 6.2 Define `Config`, `BankConfig`, and `AccountMapping` types in `src/config/config.types.ts`
- [x] 6.3 Implement `loadConfig(path: string): Config` in `src/config/config.loader.ts` with JSON schema validation
- [x] 6.4 Write unit tests for env var validation: missing `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, or `ACTUAL_SYNC_ID` throws `ConfigError` with field name in message
- [x] 6.5 Implement `loadEnvConfig(): EnvConfig` in `src/config/env.config.ts`
- [x] 6.6 Create `config.example.json` with documented structure (all fields, sample values, inline comments)
- [x] 6.7 Run `docker compose run --rm dev npm run test:unit` — config tests pass

## 7. Structured Logger (TDD)

- [x] 7.1 Implement `createLogger(context?: { bankId?, accountId? })` in `src/shared/logger.ts` wrapping `pino`; respect `LOG_LEVEL` env var; configure redaction paths for `password`, `credentials`, `j_password`
- [x] 7.2 Write unit test verifying password-like strings are NOT present in log output when an `AuthError` is logged (redaction test)
- [x] 7.3 Run `docker compose run --rm dev npm run test:unit` — redaction test passes

## 8. GlobalBank Scraper — HTML Fixtures and Parser (TDD first)

- [x] 8.1 Manually log into GlobalBank portal in a browser, save the login page HTML, the post-username (password step) page HTML, the accounts overview page HTML, and a transaction history page HTML as fixtures in `src/connectors/globalbank/fixtures/`
- [x] 8.2 Write fixture-based tests for CSRF token extraction from the login page fixture (using `page.setContent()` in a Playwright test context) — run via `docker compose run --rm dev npm run test:fixture`
- [x] 8.3 Write fixture-based tests for account list parsing: given the accounts fixture HTML, assert `parseAccounts()` returns expected `BankAccount[]`
- [x] 8.4 Write fixture-based tests for transaction row parsing: given the transactions fixture HTML, assert `parseTransactions()` returns expected `RawTransaction[]`
- [x] 8.5 Write fixture-based test for security challenge detection: given a challenge page fixture, assert `isChallengedPage()` returns `true`
- [x] 8.6 Run `docker compose run --rm dev npm run test:fixture` — all fixture tests fail (red)
- [x] 8.7 Implement `extractCsrfToken(page)` in `src/connectors/globalbank/parsers/csrf.ts`
- [x] 8.8 Implement `parseAccounts(page): Promise<BankAccount[]>` in `src/connectors/globalbank/parsers/accounts.ts` using Playwright locators by visible text/ARIA role
- [x] 8.9 Implement `parseTransactions(page): Promise<RawTransaction[]>` in `src/connectors/globalbank/parsers/transactions.ts` with pagination support
- [x] 8.10 Implement `isChallengedPage(page): Promise<boolean>` in `src/connectors/globalbank/parsers/challenge.ts`
- [x] 8.11 Run `docker compose run --rm dev npm run test:fixture` — all fixture tests pass (green)

## 9. GlobalBank Scraper — Connector (TDD)

- [x] 9.1 Write unit tests for `GlobalBankConnector.normalize()`: date formats, debit/credit sign, comma-thousands amounts, tiebreaker IDs
- [x] 9.2 Write unit test verifying `ConnectorStateError` is thrown when `getAccounts()` is called before `connect()`
- [x] 9.3 Implement `GlobalBankConnector` class in `src/connectors/globalbank/globalbank.connector.ts` implementing `BankConnector`
- [x] 9.4 Implement `connect()`: launch Playwright browser (using `BROWSER_HEADLESS` env var to toggle), navigate to login URL, perform two-step login using fixtures-validated parsers; throw typed errors on failure
- [x] 9.5 Implement `getAccounts()`: navigate to accounts overview, call `parseAccounts()`
- [x] 9.6 Implement `getTransactions(accountId, from, to)`: navigate to transaction history, apply date filter, call `parseTransactions()` with pagination
- [x] 9.7 Implement `disconnect()`: close Playwright browser and clear session state
- [x] 9.8 Register `GlobalBankConnector` in `src/connectors/index.ts` via `ConnectorRegistry.register("globalbank-pa", ...)`
- [x] 9.9 Run `docker compose run --rm dev npm run test:unit` — connector unit tests pass

## 10. ActualBudget Importer (TDD)

- [x] 10.1 Write integration tests using an in-memory temporary budget: connect, import one transaction, assert it appears in the budget, import same transaction again, assert no duplicate — run via `docker compose run --rm dev npm run test:integration`
- [x] 10.2 Write integration test for account mapping: unmapped `bankAccountId` logs warning and is skipped, mapped account imports correctly
- [x] 10.3 Write integration test verifying one account failure does not block import of remaining accounts
- [x] 10.4 Run `docker compose run --rm dev npm run test:integration` — all integration tests fail (red)
- [x] 10.5 Implement `ActualBudgetImporter.connect()` in `src/importer/actualbudget.importer.ts`: initialize API, download budget
- [x] 10.6 Implement `ActualBudgetImporter.importTransactions(transactions: CanonicalTransaction[])`: group by accountId, map to ActualBudget account via config, batch import per account using `importedId`
- [x] 10.7 Implement import error isolation: wrap each account's import in try/catch, collect errors, throw aggregated error after all accounts attempted
- [x] 10.8 Implement `ActualBudgetImporter.disconnect()`: close API connection and commit budget
- [x] 10.9 Run `docker compose run --rm dev npm run test:integration` — all integration tests pass (green)

## 11. Sync Orchestrator (TDD)

- [x] 11.1 Write unit tests for `SyncPipeline.run(bankConfig)` using mock connector and mock importer: verifies call order (`connect → getAccounts → getTransactions → normalize → import → disconnect`), verifies `disconnect` is called in finally block even on error
- [x] 11.2 Implement `SyncPipeline` class in `src/orchestrator/sync-pipeline.ts` executing the full bank pipeline with try/finally for disconnect
- [x] 11.3 Write unit tests for `SyncOrchestrator.runAll()`: all banks succeed → overall status `success`; one fails → status `partial`; all fail → status `failure`
- [x] 11.4 Implement `SyncOrchestrator` in `src/orchestrator/sync-orchestrator.ts` with per-bank error isolation and status aggregation
- [x] 11.5 Write unit test for health status file: after a partial-failure run, assert `/tmp/sync-status.json` contains expected structure and values
- [x] 11.6 Implement health status writer in `src/orchestrator/health-writer.ts`
- [x] 11.7 Implement `Scheduler` in `src/orchestrator/scheduler.ts` reading `syncIntervalCron` from config using `node-cron`
- [x] 11.8 Implement `SIGTERM`/`SIGINT` handler in `src/orchestrator/scheduler.ts`: cancel pending runs, allow in-flight run to complete, exit 0
- [x] 11.9 Implement CLI entry point `src/cli/sync-now.ts`: run one cycle via `SyncOrchestrator`, exit 0 on success, exit 1 on failure
- [x] 11.10 Implement main entry point `src/main.ts`: load config, register connectors, start `Scheduler`
- [x] 11.11 Run `docker compose run --rm dev npm run test:unit` — all orchestrator tests pass

## 12. Full Build and Smoke Validation

- [x] 12.1 Run `docker compose run --rm dev npm run lint` — no linting errors
- [x] 12.2 Run `docker compose run --rm dev npm run build` — TypeScript compiles cleanly to `dist/`
- [x] 12.3 Run `docker compose build bank-sync` — production image builds successfully
- [x] 12.4 Verify `bank-sync` service exits with `ConfigError` when config is missing: `docker compose run --rm bank-sync node dist/cli/sync-now.js` (expected failure, validates entrypoint wiring)

## 13. Documentation

- [x] 13.1 Write `README.md`: prerequisites (Docker, Docker Compose), environment variable setup, first-run manual trigger (`docker compose run --rm bank-sync node dist/cli/sync-now.js`), enabling the scheduler (`docker compose up -d bank-sync`), log inspection
- [x] 13.2 Write `docs/e2e-smoke-test.md`: step-by-step manual E2E procedure with real credentials — set `.env`, run `docker compose run --rm bank-sync node dist/cli/sync-now.js`, verify transactions appear in ActualBudget
- [x] 13.3 Write `CONTRIBUTING.md`: how to add a new bank connector — implement `BankConnector`, create HTML fixtures, write fixture tests, register in `src/connectors/index.ts`, add entry to `config.example.json`, run tests via `docker compose run --rm dev npm test`
