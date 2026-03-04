## ADDED Requirements

### Requirement: GlobalBank connector implements BankConnector
The `GlobalBankConnector` class SHALL implement the `BankConnector` interface in full and SHALL be registered in the `ConnectorRegistry` under the `bankId` `"globalbank-pa"`. It SHALL use Playwright with a Chromium browser to interact with the portal at `https://globalonline.globalbank.com.pa/eBanking/seguridad/login.htm`.

#### Scenario: Connector is retrievable from registry
- **WHEN** the application initializes and connectors are registered
- **THEN** `ConnectorRegistry.get("globalbank-pa")` SHALL return a `GlobalBankConnector` instance

---

### Requirement: Two-step portal authentication
The connector SHALL perform the two-step login flow required by GlobalBank's portal: (1) submit username and wait for the password page to render, (2) submit password. The connector SHALL handle the CSRF token present in the login form by reading it from the DOM before submission. All interaction SHALL use Playwright locators based on stable attributes (input names, ARIA roles, visible text) rather than fragile CSS class names.

#### Scenario: Successful two-step login
- **WHEN** `connect()` is called with valid username and password
- **THEN** the connector SHALL navigate through both login steps and reach the authenticated dashboard without error

#### Scenario: Invalid username
- **WHEN** `connect()` is called with an unrecognized username
- **THEN** the portal displays a login error and the connector SHALL throw `AuthError`

#### Scenario: Invalid password
- **WHEN** the username step succeeds but the password is incorrect
- **THEN** the portal displays a password error and the connector SHALL throw `AuthError`

#### Scenario: CSRF token is read per request
- **WHEN** the login form is submitted
- **THEN** the CSRF token value SHALL be read from the current DOM immediately before submission, not cached from a previous page load

---

### Requirement: Security challenge detection
The connector SHALL detect when the portal presents a security challenge (OTP, security question, or unknown challenge page) after login. Upon detection it SHALL throw an `AuthError` with `challengeDetected: true` in the error metadata and SHALL log the page URL for diagnostics.

#### Scenario: OTP challenge is detected
- **WHEN** the portal redirects to a page that does not match the expected post-login dashboard URL pattern
- **THEN** the connector SHALL throw `AuthError` with `challengeDetected: true`

---

### Requirement: Account listing
After a successful `connect()`, `getAccounts()` SHALL scrape the accounts overview page and return an array of `BankAccount` objects. Each `BankAccount` SHALL include: `id` (string, bank-side account number), `name` (string, display name shown in portal), `type` (`checking` | `savings` | `credit` | `loan` | `unknown`), and `balance` (integer cents).

#### Scenario: Multiple accounts returned
- **WHEN** `getAccounts()` is called on a session with two visible accounts
- **THEN** it SHALL return an array of exactly two `BankAccount` objects with correct `id` and `name` values

#### Scenario: Account type mapping
- **WHEN** the portal displays an account labeled as a "Cuenta Corriente" (checking account)
- **THEN** the returned `BankAccount.type` SHALL be `"checking"`

---

### Requirement: Transaction extraction
`getTransactions(accountId, from, to)` SHALL navigate to the transaction history for the given account, apply the provided date range filter, and return all transactions within that range as `RawTransaction[]`. The raw transaction object SHALL preserve the original fields as strings before normalization. The connector SHALL handle pagination if the portal limits results per page.

#### Scenario: Transactions within date range are returned
- **WHEN** `getTransactions("001-123456-7", new Date("2026-02-01"), new Date("2026-02-28"))` is called
- **THEN** all transactions dated between Feb 1 and Feb 28 (inclusive) SHALL be returned and no transactions outside that range SHALL appear

#### Scenario: Empty result for range with no activity
- **WHEN** `getTransactions()` is called for a date range with no transactions
- **THEN** it SHALL return an empty array without throwing

#### Scenario: Pagination is followed
- **WHEN** the portal shows a "next page" control and there are more transactions
- **THEN** the connector SHALL follow all pages and return the complete set of transactions

#### Scenario: Unknown account ID
- **WHEN** `getTransactions()` is called with an `accountId` not present in `getAccounts()`
- **THEN** the connector SHALL throw a `ParseError` indicating the account was not found

---

### Requirement: Transaction normalization
The connector SHALL include a `normalize(raw: RawTransaction[]): CanonicalTransaction[]` method that transforms raw portal data into the canonical format. Date strings SHALL be parsed from the portal's locale format (`DD/MM/YYYY` or similar) into ISO 8601. Amount strings (e.g. `"1,234.56"` or `"-$50.00"`) SHALL be parsed into integer cents. The sign convention from the `CanonicalTransaction` spec SHALL be enforced.

#### Scenario: Date format conversion
- **WHEN** the portal returns a date string `"04/03/2026"`
- **THEN** the normalized `date` SHALL be `"2026-03-04"`

#### Scenario: Debit amount normalization
- **WHEN** the portal returns an amount string representing a $15.50 payment
- **THEN** the normalized `amount` SHALL be `-1550`

#### Scenario: Credit amount normalization
- **WHEN** the portal returns an amount string representing a $200.00 deposit
- **THEN** the normalized `amount` SHALL be `20000`

#### Scenario: Comma-separated thousands in amount
- **WHEN** the portal returns `"1,234.56"` as an amount string
- **THEN** commas SHALL be stripped before parsing and the result SHALL be `123456` cents

---

### Requirement: Fixture-based unit tests for scraper parsing
The scraper's HTML parsing and normalization logic SHALL be testable without a live browser session using saved HTML fixtures. Tests SHALL load fixture HTML via Playwright's `page.setContent()` and assert on the parsed output. Fixtures SHALL be stored in `src/connectors/globalbank/fixtures/` and committed to the repository.

#### Scenario: Login page fixture parses CSRF token
- **WHEN** the login page fixture HTML is loaded
- **THEN** the CSRF token extraction logic SHALL return the expected token value from the fixture

#### Scenario: Transactions page fixture returns expected records
- **WHEN** the transactions page fixture HTML is loaded and parsed
- **THEN** the scraper SHALL return the exact list of transactions present in the fixture
