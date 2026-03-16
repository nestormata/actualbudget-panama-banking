## Why

Banco General is one of Panama's major banks with no public API or Open Banking interface. Users with accounts there cannot automatically sync transactions into ActualBudget — the existing sync platform already handles GlobalBank but needs a second connector to cover Banco General.

## What Changes

- **New**: A Playwright-based connector for Banco General's online banking portal (`zonasegura.bgeneral.com`), implementing the existing `BankConnector` interface
- **New**: A three-step login flow handler: navigate with username in URL → match and answer a randomly-selected security question → submit password
- **New**: Security question matching via regex patterns loaded from the `BGENERAL_SECURITY_QA` environment variable (JSON array of `{pattern, answer}` objects — no credentials ever in code or config)
- **New**: Account transaction parser for checking/savings accounts (default recent-transactions view)
- **New**: Credit card transaction parser for current statement and previous statement
- **New**: Registration of the connector in the connector registry under `bankId` `"bgeneral-pa"`
- **New**: Fixture-based unit tests for all parsing logic

## Capabilities

### New Capabilities

- `bgeneral-scraper`: Playwright-based connector that authenticates against `zonasegura.bgeneral.com` via a three-step SPA login flow (username-in-URL → security question → password), scrapes checking/savings account transactions from the default recent-transactions view, and scrapes credit card transactions from the current and previous billing statements.

### Modified Capabilities

<!-- None: the BankConnector interface is unchanged; only a new implementation is added -->

## Impact

- **New files**: `src/connectors/bgeneral/` directory with connector and parsers
- **Modified**: `src/connectors/index.ts` — register `BgeneralConnector` under `"bgeneral-pa"`
- **New env vars**: `BGENERAL_USER`, `BGENERAL_PASS`, `BGENERAL_SECURITY_QA` (credentials never stored in code or config files)
- **No interface changes**: `BankConnector`, `BankConfig`, and `CanonicalTransaction` are unchanged
- **No new dependencies**: Playwright is already installed
