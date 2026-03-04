## ADDED Requirements

### Requirement: ActualBudget connection
The importer SHALL connect to a running ActualBudget instance using `@actual-app/api`. The connection parameters (server URL, password, budget sync ID) SHALL be read from environment variables: `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, and `ACTUAL_SYNC_ID`. The importer SHALL initialize the API and download the budget file before any import operation.

#### Scenario: Successful connection to ActualBudget
- **WHEN** all required environment variables are set and the ActualBudget server is reachable
- **THEN** `ActualBudgetImporter.connect()` SHALL resolve without error

#### Scenario: Missing environment variable
- **WHEN** `ACTUAL_SERVER_URL` is not set
- **THEN** the importer SHALL throw a descriptive `ConfigError` at startup before attempting any connection

#### Scenario: Unreachable ActualBudget server
- **WHEN** the configured server URL is not reachable
- **THEN** the importer SHALL throw a `NetworkError` with the URL included in the message

---

### Requirement: Account mapping
The importer SHALL read an account mapping from the loaded `config.json` that maps `bankAccountId` (bank-side) to `actualBudgetAccountId` (ActualBudget-side). The importer SHALL refuse to import transactions for a bank account that has no mapping and SHALL log a warning with the unmapped `bankAccountId`. Import SHALL continue for all other mapped accounts.

#### Scenario: Mapped account imports successfully
- **WHEN** a `CanonicalTransaction` with `accountId: "001-123456-7"` is received and the config maps it to `actualBudgetAccountId: "abc123"`
- **THEN** the transaction SHALL be imported into the ActualBudget account with ID `"abc123"`

#### Scenario: Unmapped account is skipped with warning
- **WHEN** a `CanonicalTransaction` arrives for a `bankAccountId` not present in the mapping
- **THEN** it SHALL be skipped, a warning SHALL be logged including the `bankAccountId`, and the import SHALL not throw

---

### Requirement: Idempotent transaction import
The importer SHALL use the `id` field of `CanonicalTransaction` as the `importedId` when calling `@actual-app/api`'s import function. ActualBudget deduplicates by `importedId`; the importer SHALL rely on this mechanism and SHALL NOT maintain its own deduplication state. Each sync run MAY safely re-import the same set of transactions.

#### Scenario: Importing the same transaction twice does not create duplicates
- **WHEN** a transaction with a given `id` is imported, and then the same transaction is imported again in a subsequent run
- **THEN** ActualBudget SHALL contain exactly one transaction with that `importedId`

#### Scenario: New transactions are added on subsequent runs
- **WHEN** a second sync run includes a transaction with an `id` not previously imported
- **THEN** that transaction SHALL appear in ActualBudget after the second run

---

### Requirement: Batch import per account
The importer SHALL group `CanonicalTransaction[]` by `accountId` before calling `@actual-app/api`. Each account's transactions SHALL be submitted in a single batch call rather than one call per transaction. The importer SHALL commit the budget after all accounts have been imported.

#### Scenario: Transactions grouped and submitted per account
- **WHEN** 10 transactions are received (5 for account A and 5 for account B)
- **THEN** exactly two API batch calls SHALL be made (one per account) and one commit call

---

### Requirement: Import error isolation
If the import for one account fails (e.g. invalid account ID in ActualBudget), the importer SHALL log the error including the `actualBudgetAccountId` and the number of dropped transactions, and SHALL continue importing remaining accounts. The importer SHALL NOT throw until all accounts have been attempted; then it SHALL throw an aggregated error if any account failed.

#### Scenario: One account failure does not block others
- **WHEN** importing for account A fails and account B is valid
- **THEN** account B's transactions SHALL be imported and the importer SHALL throw after completing all accounts

---

### Requirement: Integration tests using in-memory ActualBudget
The importer's tests SHALL use `@actual-app/api` initialized against a local temporary budget file (not a live server) to verify import, deduplication, and account-mapping behavior. Tests SHALL create a fresh temporary budget before each test and clean up after. No live ActualBudget server SHALL be required to run the test suite.

#### Scenario: Integration test creates and imports a transaction
- **WHEN** a test initializes an in-memory budget, runs the importer with one `CanonicalTransaction`, and queries the budget
- **THEN** the budget SHALL contain exactly one transaction matching the imported data
