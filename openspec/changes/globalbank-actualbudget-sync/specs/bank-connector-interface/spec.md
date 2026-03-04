## ADDED Requirements

### Requirement: BankConnector interface
Every bank integration SHALL implement the `BankConnector` interface. The interface SHALL define the following methods: `connect(): Promise<void>`, `getAccounts(): Promise<BankAccount[]>`, `getTransactions(accountId: string, from: Date, to: Date): Promise<RawTransaction[]>`, and `disconnect(): Promise<void>`. Implementing classes MUST be stateless between calls except for session state managed internally.

#### Scenario: Successful connection lifecycle
- **WHEN** a connector's `connect()` is called with valid credentials
- **THEN** it SHALL resolve without error and the connector SHALL be ready to serve `getAccounts()` and `getTransactions()` calls

#### Scenario: Connection with invalid credentials
- **WHEN** a connector's `connect()` is called with invalid credentials
- **THEN** it SHALL throw an `AuthError` with a human-readable message and SHALL NOT throw a generic `Error`

#### Scenario: Calling getTransactions before connect
- **WHEN** `getTransactions()` is called on a connector that has not yet had `connect()` called
- **THEN** it SHALL throw a `ConnectorStateError` indicating the connector is not authenticated

#### Scenario: Disconnect cleans up session
- **WHEN** `disconnect()` is called after a successful `connect()`
- **THEN** it SHALL release all browser/network resources and subsequent calls to `getAccounts()` SHALL throw `ConnectorStateError`

---

### Requirement: CanonicalTransaction type
The system SHALL define a shared `CanonicalTransaction` type that all connectors produce after normalization. The type SHALL contain: `id` (string, stable content-based hash), `bankId` (string), `accountId` (string), `date` (ISO 8601 string `YYYY-MM-DD`), `amount` (integer number of cents, negative for debits), `payee` (string), and `notes` (string or null).

#### Scenario: Amount sign convention for debits
- **WHEN** a transaction represents money leaving the account (debit/payment)
- **THEN** the `amount` field SHALL be a negative integer (e.g. -1500 for $15.00)

#### Scenario: Amount sign convention for credits
- **WHEN** a transaction represents money entering the account (deposit/credit)
- **THEN** the `amount` field SHALL be a positive integer (e.g. 5000 for $50.00)

#### Scenario: Date normalization
- **WHEN** a bank returns a date in any locale-specific format (e.g. `04/03/2026` or `04-MAR-2026`)
- **THEN** the normalized `date` field SHALL always be ISO 8601 `YYYY-MM-DD`

---

### Requirement: Stable transaction ID generation
The system SHALL generate a stable, deterministic `id` for each `CanonicalTransaction` by hashing the concatenation of `bankId`, `accountId`, `date`, `amount`, and `payee` using SHA-256. When multiple transactions on the same day share the same `accountId`, `amount`, and `payee`, a zero-based positional index within that group SHALL be appended before hashing to avoid collisions.

#### Scenario: Same transaction produces same ID across runs
- **WHEN** the same transaction data is normalized in two separate sync runs
- **THEN** both runs SHALL produce identical `id` values

#### Scenario: Collision tiebreaker for identical same-day transactions
- **WHEN** two transactions share the same date, amount, payee, and accountId
- **THEN** they SHALL receive distinct IDs by appending index `0` and `1` respectively before hashing

---

### Requirement: Typed error hierarchy
The system SHALL define a typed error hierarchy rooted at `BankConnectorError`. Subtypes SHALL include: `AuthError` (authentication failed), `NetworkError` (connectivity failure), `ParseError` (unexpected portal structure), and `ConnectorStateError` (method called in wrong lifecycle state). All errors SHALL include a `bankId` property identifying the source connector.

#### Scenario: AuthError is distinguishable from NetworkError
- **WHEN** the connector throws an error due to wrong credentials
- **THEN** the thrown error SHALL be an instance of `AuthError` and `instanceof NetworkError` SHALL be false

#### Scenario: ParseError includes diagnostic context
- **WHEN** a scraper cannot find an expected DOM element
- **THEN** it SHALL throw a `ParseError` with a `selector` property describing what was expected

---

### Requirement: ConnectorRegistry
The system SHALL provide a `ConnectorRegistry` singleton that maps `bankId` strings to `BankConnector` factory functions. Connectors SHALL register themselves via `ConnectorRegistry.register(bankId, factoryFn)`. The orchestrator SHALL resolve connectors via `ConnectorRegistry.get(bankId)`. Requesting an unregistered `bankId` SHALL throw a descriptive error.

#### Scenario: Register and retrieve a connector
- **WHEN** a connector factory is registered under `bankId` `"globalbank-pa"`
- **THEN** `ConnectorRegistry.get("globalbank-pa")` SHALL return a new instance from that factory

#### Scenario: Retrieve unregistered bankId
- **WHEN** `ConnectorRegistry.get("unknown-bank")` is called
- **THEN** it SHALL throw an error with a message listing all registered bankIds
