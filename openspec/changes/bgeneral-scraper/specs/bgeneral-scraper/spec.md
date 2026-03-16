## ADDED Requirements

### Requirement: BGeneralConnector implements BankConnector
The `BGeneralConnector` class SHALL implement the `BankConnector` interface in full and SHALL be registered in the `ConnectorRegistry` under the `bankId` `"bgeneral-pa"`. It SHALL use Playwright with a Chromium browser to interact with the portal at `https://zonasegura.bgeneral.com`.

#### Scenario: Connector is retrievable from registry
- **WHEN** the application initialises and connectors are registered
- **THEN** `ConnectorRegistry.get("bgeneral-pa")` SHALL return a `BGeneralConnector` instance

---

### Requirement: Credentials loaded exclusively from environment variables
The connector SHALL read `BGENERAL_USER`, `BGENERAL_PASS`, and `BGENERAL_SECURITY_QA` from environment variables at instantiation time. No credential, security question pattern, or security answer SHALL appear in source code, config files, test fixtures, or log output.

`BGENERAL_SECURITY_QA` SHALL be a valid JSON array of objects with the shape `{ pattern: string; answer: string }`. If the variable is absent or not valid JSON, the connector factory SHALL throw a `ConfigError` at startup — before any browser is launched — with an error message that shows the expected format but never the actual value.

#### Scenario: Missing BGENERAL_USER throws at startup
- **WHEN** `BGENERAL_USER` is not set in the environment
- **THEN** the connector factory SHALL throw a `ConfigError` before any browser is launched

#### Scenario: Malformed BGENERAL_SECURITY_QA throws at startup
- **WHEN** `BGENERAL_SECURITY_QA` contains invalid JSON
- **THEN** the connector factory SHALL throw a `ConfigError` whose message shows the expected format but does NOT include the raw env var value

#### Scenario: Valid env vars produce a connector instance
- **WHEN** all three env vars are present and `BGENERAL_SECURITY_QA` is a valid JSON array
- **THEN** the connector factory SHALL return a `BGeneralConnector` instance without error

---

### Requirement: Three-step SPA login
The connector SHALL perform the three-step login required by Banco General's SPA portal:
1. Navigate to `https://zonasegura.bgeneral.com/web/guest/home#!/login/username?username=<user>` and wait for the security-question step to render.
2. Read the displayed question text, match it case-insensitively against the `pattern` fields in `BGENERAL_SECURITY_QA`, fill the matching answer, and submit.
3. Wait for the password step to render, fill the password from `BGENERAL_PASS`, and submit.
4. Wait for the authenticated dashboard selector to confirm a successful login.

Because the portal uses hash-based SPA routing, the connector SHALL wait for specific DOM selectors at each step rather than relying on `waitForLoadState('networkidle')`.

#### Scenario: Successful three-step login
- **WHEN** `connect()` is called with valid credentials and a matching security question answer exists
- **THEN** the connector SHALL navigate through all three steps and reach the authenticated dashboard without error

#### Scenario: No matching security question pattern
- **WHEN** the portal presents a security question that matches none of the patterns in `BGENERAL_SECURITY_QA`
- **THEN** the connector SHALL throw an `AuthError` with a message indicating no matching pattern was found, and SHALL NOT include the answer value in the error

#### Scenario: Invalid password
- **WHEN** the security question step succeeds but the password is incorrect
- **THEN** the portal displays a login error and the connector SHALL throw an `AuthError`

---

### Requirement: Security question logging
Every time the portal presents a security question, the connector SHALL log the full raw question text at `info` level. This provides the operator with the exact question strings needed to craft or update regex patterns in `BGENERAL_SECURITY_QA`. The log entry SHALL include the fields `bankId`, `step: "security-question"`, `securityQuestion` (the raw text), and `matched` (boolean). The answer SHALL NEVER appear in any log entry.

#### Scenario: Matched question is logged at info
- **WHEN** the portal presents a security question and a matching pattern is found
- **THEN** a log entry at `info` level SHALL be emitted with `securityQuestion` set to the raw question text and `matched: true`

#### Scenario: Unmatched question is logged at warn
- **WHEN** the portal presents a security question that matches no pattern
- **THEN** a log entry at `warn` level SHALL be emitted with `securityQuestion` set to the raw question text and `matched: false`, enabling the operator to add the missing pattern

#### Scenario: Answer never appears in logs
- **WHEN** any log entry is emitted during the login flow
- **THEN** none of the log entry fields SHALL contain the answer string from `BGENERAL_SECURITY_QA`

---

### Requirement: Account listing
After a successful `connect()`, `getAccounts()` SHALL scrape the accounts overview page and return an array of `BankAccount` objects. Each object SHALL include `id` (bank-side account number), `name` (display name), `type` (`checking` | `savings` | `credit` | `unknown`), `balance` (integer cents), `currency`, and `rawBalance`. Credit cards SHALL be tagged `type: "credit"`.

#### Scenario: Multiple accounts and one credit card returned
- **WHEN** `getAccounts()` is called on a session with two checking accounts and one credit card
- **THEN** it SHALL return three `BankAccount` objects; the credit card SHALL have `type: "credit"` and the others SHALL have `type: "checking"` or `"savings"`

#### Scenario: Called before connect throws ConnectorStateError
- **WHEN** `getAccounts()` is called before `connect()`
- **THEN** it SHALL throw a `ConnectorStateError`

---

### Requirement: Account transaction scraping
For accounts with `type: "checking"` or `"savings"`, `getTransactions()` SHALL navigate to the account's default recent-transactions view and return all visible transactions as `RawTransaction[]`. No date-range filter is applied; the portal's default view is used as-is.

#### Scenario: Recent transactions are returned
- **WHEN** `getTransactions()` is called for a checking account
- **THEN** all transactions visible in the default portal view SHALL be returned with correct `payee`, `rawDate`, `rawAmount`, and `isDebit` fields

#### Scenario: Empty account returns empty array
- **WHEN** the account has no recent transactions
- **THEN** `getTransactions()` SHALL return an empty array without throwing

---

### Requirement: Credit card statement scraping
For accounts with `type: "credit"`, `getTransactions()` SHALL scrape transactions from the current (open) billing statement. If a previous (most-recently closed) statement is available in the portal, its transactions SHALL also be included. Both sets are concatenated and returned as a single `RawTransaction[]`.

#### Scenario: Current statement transactions are returned
- **WHEN** `getTransactions()` is called for a credit card account
- **THEN** all transactions from the current open statement SHALL be included in the result

#### Scenario: Previous statement transactions included when available
- **WHEN** a previous closed statement is accessible in the portal
- **THEN** its transactions SHALL be appended to the result after the current statement's transactions

#### Scenario: No previous statement does not throw
- **WHEN** only the current statement exists (e.g. a new card)
- **THEN** `getTransactions()` SHALL return only the current statement's transactions without error

---

### Requirement: Transaction normalization
The connector SHALL include a `normalize(raw: RawTransaction[], accountId: string): CanonicalTransaction[]` method that transforms raw portal data into the canonical format. Date strings SHALL be parsed from the portal's locale format into ISO 8601 (`YYYY-MM-DD`). Amount strings SHALL be parsed into integer cents. The sign convention (negative = debit) from the `CanonicalTransaction` spec SHALL be enforced.

#### Scenario: Date format conversion
- **WHEN** the portal returns a date string such as `"05/03/2026"`
- **THEN** the normalized `date` SHALL be `"2026-03-05"`

#### Scenario: Debit amount normalization
- **WHEN** the portal returns an amount representing a $15.50 payment with `isDebit: true`
- **THEN** the normalized `amount` SHALL be `-1550`

#### Scenario: Credit amount normalization
- **WHEN** the portal returns an amount representing a $200.00 deposit with `isDebit: false`
- **THEN** the normalized `amount` SHALL be `20000`

---

### Requirement: DOM selector constants
All CSS/ARIA selectors used by the connector and its parsers SHALL be defined as named constants in a `SEL` object at the top of each file. No selector string literal SHALL appear inline within function bodies.

#### Scenario: Selector used by name
- **WHEN** a parser needs to locate the security-question input
- **THEN** it SHALL reference `SEL.SECURITY_ANSWER_INPUT` (or equivalent), not a raw string literal

---

### Requirement: Sanitised HTML fixtures
HTML fixtures stored under `src/connectors/bgeneral/fixtures/` SHALL have all personal and financial data removed before being committed: real account numbers replaced with `XXXX-XXXX`, real balances with `0.00`, real transaction descriptions with generic placeholders, and real payee names with generic names. Real dates MAY be kept to support date-format parsing tests. No real credential, answer, or personally identifiable information SHALL appear in any committed fixture file.

#### Scenario: Fixture parses without real data
- **WHEN** a sanitised accounts fixture is loaded and parsed
- **THEN** the parser returns `BankAccount` objects with placeholder values and no test assertion relies on a real account number or balance

#### Scenario: Transactions fixture returns expected structure
- **WHEN** a sanitised transactions fixture is loaded and parsed
- **THEN** the parser returns `RawTransaction[]` with the correct field structure and date format, independent of real financial values
