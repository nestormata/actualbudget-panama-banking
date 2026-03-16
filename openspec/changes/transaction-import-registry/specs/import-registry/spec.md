## ADDED Requirements

### Requirement: Registry stores imported transaction IDs per account
The system SHALL maintain one text file per account at `data/<bankId>/<accountId>.txt`, containing one transaction ID per line. The file SHALL be created automatically on first write. The registry SHALL survive process restarts.

#### Scenario: File created on first import
- **WHEN** an account has no registry file and transactions are imported
- **THEN** the file is created and all imported IDs are written to it

#### Scenario: IDs persist across restarts
- **WHEN** the process restarts and a sync runs
- **THEN** the registry file is read and IDs from previous runs are recognised

### Requirement: Registry prevents re-import of deleted transactions
The system SHALL filter out any transaction whose ID already exists in the account's registry file before sending transactions to ActualBudget.

#### Scenario: Deleted transaction is not re-imported
- **WHEN** a transaction was previously imported and then deleted from ActualBudget
- **THEN** that transaction is excluded from the next import batch and NOT sent to ActualBudget

#### Scenario: New transactions are imported normally
- **WHEN** a transaction ID is not present in the registry file
- **THEN** the transaction is included in the import batch as normal

#### Scenario: Deduplicated count is reported
- **WHEN** one or more transactions are filtered by the registry
- **THEN** `ImportResult.deduplicated` reflects the number of transactions skipped

### Requirement: Registry rotates to keep the last 1000 entries
The system SHALL cap each registry file at 1000 IDs. When the cap is exceeded, the oldest entries SHALL be removed so that exactly 1000 remain.

#### Scenario: Rotation on overflow
- **WHEN** adding new IDs would bring the total above 1000
- **THEN** the oldest entries are dropped and the file contains exactly 1000 IDs after the write

#### Scenario: File under cap is not rotated
- **WHEN** the total number of IDs after adding new ones is 1000 or fewer
- **THEN** all IDs are retained and no entries are dropped

### Requirement: Registry write is atomic
The system SHALL write the registry file atomically (write to a `.tmp` file then rename) to prevent corruption on partial writes.

#### Scenario: Crash during write does not corrupt registry
- **WHEN** the process is interrupted mid-write
- **THEN** the registry file retains its previous valid content

### Requirement: Registry file loads resiliently
The system SHALL ignore any line in the registry file that is not a valid 64-character lowercase hex string (SHA-256).

#### Scenario: Corrupted line is skipped
- **WHEN** the registry file contains a malformed line
- **THEN** that line is silently ignored and valid IDs are loaded normally

### Requirement: CLI supports clearing the registry
The system SHALL accept a `--clear-registry` flag that deletes registry files before running a sync, with optional filters.

#### Scenario: Clear all registries
- **WHEN** `--clear-registry` is passed with no other filters
- **THEN** all files under `data/` are deleted

#### Scenario: Clear by bank
- **WHEN** `--clear-registry --bank <bankId>` is passed
- **THEN** all files under `data/<bankId>/` are deleted

#### Scenario: Clear by account
- **WHEN** `--clear-registry --bank <bankId> --account <accountId>` is passed
- **THEN** only `data/<bankId>/<accountId>.txt` is deleted

#### Scenario: Clear with no existing files is a no-op
- **WHEN** `--clear-registry` is passed but no registry files exist
- **THEN** no error is thrown and the sync proceeds normally
