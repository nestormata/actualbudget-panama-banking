## Context

The sync platform already runs GlobalBank Panama via the `BankConnector` interface and `ConnectorRegistry`. Banco General is Panama's largest bank and uses a fundamentally different portal stack: a Liferay-based SPA at `zonasegura.bgeneral.com` with hash-based routing (`#!/...`). The login flow is three steps (username pre-filled in URL, random security question, then password), and the portal distinguishes between checking/savings accounts (recent-transactions list view) and credit cards (billing-statement view).

All credentials — username, password, and security question answers — MUST reside exclusively in environment variables. No credential or secret may appear in source code, config files, fixtures, or logs.

## Goals / Non-Goals

**Goals:**
- Add a fully working `BGeneralConnector` that satisfies `BankConnector` without modifying the interface, registry, importer, orchestrator, or Docker setup
- Handle the three-step SPA login securely, reading all secrets from env vars at runtime only
- Scrape checking/savings transactions from the default recent-transactions view
- Scrape credit card transactions from the current billing statement and optionally the previous one
- Provide fixture-based unit tests for all parsing logic with **no real credentials in fixtures** (sanitized HTML only)
- Isolate all CSS/DOM selectors in named constants so selector drift is a one-line fix

**Non-Goals:**
- Date-range filtering for account transactions (scrape the default view only)
- Downloading statement PDFs
- Initiating payments or transfers
- Handling SMS OTP (portal does not use OTP)

## Decisions

### 1. Credentials: environment variables only

**Chosen**: Three env vars — `BGENERAL_USER`, `BGENERAL_PASS`, and `BGENERAL_SECURITY_QA`.

`BGENERAL_SECURITY_QA` is a JSON array of `{ pattern: string; answer: string }` objects, where `pattern` is a case-insensitive regex matched against the displayed question text:

```
BGENERAL_SECURITY_QA=[{"pattern":"aniversario.*boda","answer":"..."},{"pattern":"escuela.*primaria","answer":"..."}]
```

**Rationale**: Security question pairs are structured data unsuitable for flat key-value env vars, but a JSON env var keeps everything in one place, remains gitignored, and lets Docker Compose inject them as secrets. No answer or pattern ever appears in code, config files, or test fixtures.

**Security rules enforced throughout:**
- Answers are never logged, even at debug level
- Answers are never included in error messages
- The loaded `securityQA` array is never serialised back to a string after parsing
- Test fixtures contain only sanitized HTML with dummy question text

---

### 2. SPA login: wait-for-selector strategy

**Chosen**: Each step waits for a specific DOM selector to appear before proceeding, rather than `waitForLoadState('networkidle')`.

```
Step 1 → navigate to #!/login/username?username=<user>
         wait: page settles with security-question input visible
Step 2 → read question text, regex-match against BGENERAL_SECURITY_QA
         fill answer, click submit
         wait: password input visible
Step 3 → fill password, click submit
         wait: post-login dashboard selector visible
```

**Rationale**: The `#!/...` hash routing re-renders components without HTTP navigation events, so `networkidle` is unreliable. Waiting for a specific sentinel selector is precise and fast.

**Security question logging**: Every time the portal presents a security question, the connector SHALL log the full raw question text at `info` level under the key `securityQuestion`. This gives the operator a reliable source of the exact question strings to use when crafting or updating regex patterns in `BGENERAL_SECURITY_QA`. The answer is NEVER logged under any circumstances.

```jsonc
// example log entry
{ "level": "info", "bankId": "bgeneral-pa", "step": "security-question",
  "securityQuestion": "¿Cuál es el nombre de tu escuela primaria?", "matched": true }
```

**If no security question pattern matches**: throw `AuthError` with message `"No matching security question answer found"` and log the question text at `warn` level so the operator can add the missing pattern — do NOT include the answer in the error or log.

---

### 3. Account vs credit card dispatch

**Chosen**: `getAccounts()` tags each account with `type: 'credit'` or `type: 'checking'`/`'savings'` based on portal markup. `getTransactions()` inspects `account.type` and dispatches to one of two scraping paths:

```
type: checking | savings  →  scrapeAccountTransactions(page, account)
type: credit              →  scrapeCreditCardTransactions(page, account)
```

Each path lives in its own parser module (`parsers/transactions.ts` and `parsers/credit-card.ts`) to keep files focused and independently testable.

---

### 4. Selector constants pattern

**Chosen**: All CSS/ARIA selectors are defined as `const` at the top of each file:

```ts
const SEL = {
  SECURITY_QUESTION_TEXT: '[data-field="preguntaSeguridad"] label',
  SECURITY_ANSWER_INPUT:  '[data-field="respuestaSeguridad"] input',
  // ...
} as const;
```

**Rationale**: When the portal changes markup (inevitable), fixing the connector requires editing one object, not hunting through scattered string literals.

---

### 5. Current + previous statement for credit cards

**Chosen**: `scrapeCreditCardTransactions` scrapes the current (open) statement and, if available, the immediately preceding closed statement. Both are concatenated and returned as `RawTransaction[]`. The connector does not go further back than one previous statement.

**Rationale**: The `daysToFetch` window in config is ≤ 30 days for most users; one previous statement covers any gap. Fetching all historical statements would be slow and is not needed for routine sync.

---

### 6. No changes to shared code

**Chosen**: `BankConnector`, `BankConfig`, `CanonicalTransaction`, `ConnectorRegistry`, the orchestrator, the importer, and `config.json` are all unchanged. The only shared-code touch is adding the import to `src/connectors/index.ts`.

**Rationale**: Validates that the connector architecture is truly pluggable. Any required shared-code change would signal an interface design gap to fix first.

---

### 7. Fixture sanitisation policy

**Chosen**: HTML fixtures stored in `src/connectors/bgeneral/fixtures/` are manually sanitised before committing:
- Real account numbers replaced with `XXXX-XXXX`
- Real balances replaced with `0.00`
- Real transaction descriptions replaced with generic text (`COMPRA EN TIENDA`)
- Real dates kept (they drive format-parsing tests)
- No real name, no real payee, no real amount that could identify a person

**Rationale**: Fixtures must be committable without exposing personal or financial data.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Banco General portal markup changes → selectors break | All selectors in named `SEL` constants; `ParseError` messages include the selector name (not user data) for fast diagnosis |
| Security question regex matches wrong question | Patterns anchored to distinctive keywords; if zero or multiple patterns match, throw `AuthError` with count but not question text |
| Bot detection on `zonasegura.bgeneral.com` (Akamai/similar) | Use full Chromium with realistic `userAgent` and `Accept-Language: es-PA`; match GlobalBank connector's existing fingerprint approach |
| SPA components render after selectors become visible (stale data) | Use `page.waitForFunction()` to assert non-empty content, not just element presence, where needed |
| Credit card "previous statement" link absent (new card) | Treat absence as zero previous-statement transactions; log at `info` level — no error |
| `BGENERAL_SECURITY_QA` env var malformed JSON | Validate and throw `ConfigError` at startup (before any browser launches); error message shows expected format without revealing the value |

## Open Questions

- Exact DOM selectors for `zonasegura.bgeneral.com` — unknown without a live session. Implementation starts with documented placeholder constants; selectors are filled in during manual inspection with browser DevTools on first run.
- Does the portal redirect to a "remember this device" page on first Playwright login? If so, the connector needs a step to dismiss or skip it.
- Credit card: does "previous statement" always refer to the last closed billing cycle, or can there be multiple selectable periods? (Assume one for now; revisit if the portal shows otherwise.)
