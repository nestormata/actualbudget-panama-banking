## 1. Environment Variable Documentation

- [x] 1.1 Add `BGENERAL_USER`, `BGENERAL_PASS`, and `BGENERAL_SECURITY_QA` to `.env.example` with placeholder values and inline comments explaining the JSON format for `BGENERAL_SECURITY_QA` — no real values
- [x] 1.2 Update `README.md` to document the three new env vars, the `BGENERAL_SECURITY_QA` JSON format, and note that security question logs (`securityQuestion` field at `info`/`warn` level) are the authoritative source for obtaining the exact question strings to use as patterns

## 2. Connector Directory and Credential Loader

- [x] 2.1 Create directory structure `src/connectors/bgeneral/parsers/` and `src/connectors/bgeneral/fixtures/`
- [x] 2.2 Write unit tests for the credential loader
- [x] 2.3 Implement `loadBgeneralCredentials()` in `src/connectors/bgeneral/bgeneral.credentials.ts`
- [x] 2.4 Run `npm run test:unit` — credential loader tests pass

## 3. HTML Fixtures (Sanitised)

- [x] 3.1 ✅ DONE: Log into `zonasegura.bgeneral.com` in a browser with DevTools open; replace placeholder fixtures in `src/connectors/bgeneral/fixtures/` with real sanitised HTML
- [x] 3.2 ✅ DONE: Sanitise all fixture files (account numbers → `XXXX-XXXX`, balances → `0.00`, payees → `COMERCIO EJEMPLO`, names → `NOMBRE EJEMPLO`)
- [x] 3.3 ✅ DONE: Record exact selector paths in `src/connectors/bgeneral/SELECTORS.md` and update `SEL` constants in each parser file

## 4. Parser: Accounts

- [x] 4.1 Write fixture-based tests for `parseAccounts(page)`
- [x] 4.2 Run `npm run test:fixture` — account parser tests fail (red)
- [x] 4.3 Implement `parseAccounts(page)` in `src/connectors/bgeneral/parsers/accounts.ts`
- [x] 4.4 Run `npm run test:fixture` — account parser tests pass (green)

## 5. Parser: Account Transactions

- [x] 5.1 Write fixture-based tests for `parseTransactions(page, accountId)`
- [x] 5.2 Run `npm run test:fixture` — transaction parser tests fail (red)
- [x] 5.3 Implement `parseTransactions(page, accountId)` in `src/connectors/bgeneral/parsers/transactions.ts`
- [x] 5.4 Run `npm run test:fixture` — transaction parser tests pass (green)

## 6. Parser: Credit Card Statements

- [x] 6.1 Write fixture-based tests for `parseCreditCardTransactions(page, accountId)`
- [x] 6.2 Run `npm run test:fixture` — credit card parser tests fail (red)
- [x] 6.3 Implement `parseCreditCardTransactions(page, accountId)` in `src/connectors/bgeneral/parsers/credit-card.ts`
- [x] 6.4 Run `npm run test:fixture` — credit card parser tests pass (green)

## 7. BGeneralConnector — Login and Lifecycle

- [x] 7.1 Write unit tests for `BGeneralConnector`
- [x] 7.2 Implement `BGeneralConnector` class in `src/connectors/bgeneral/bgeneral.connector.ts`
- [x] 7.3 Implement `connect()` with three-step login and security question logging
- [x] 7.4 Implement `getAccounts()`
- [x] 7.5 Implement `getTransactions(accountId, from, to)`
- [x] 7.6 Implement `normalize(raw, accountId)`
- [x] 7.7 Implement `disconnect()`
- [x] 7.8 Run `npm run test:unit` — connector unit tests pass

## 8. Registry Registration and Config Example

- [x] 8.1 Register `BGeneralConnector` in `src/connectors/index.ts` under `"bgeneral-pa"`
- [x] 8.2 Add a `bgeneral-pa` bank entry to `config.example.json`

## 9. Full Validation

- [x] 9.1 Run `npm run lint` — no linting errors in new files
- [x] 9.2 Run `npm run build` — TypeScript compiles cleanly with no errors
- [x] 9.3 Run `npm test` — all unit and fixture tests pass
- [ ] 9.4 ⚠️ MANUAL: Run smoke test once real fixtures and selectors are captured
