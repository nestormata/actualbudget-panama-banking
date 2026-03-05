# Banco General Portal — Real CSS Selectors

> **Captured via chrome-bridge on 2026-03-04 from live portal.**
> All selectors below were verified against the live `zonasegura.bgeneral.com` portal.

---

## Login flow (SPA — `/web/guest/home#!/login/...`)

| Step | Selector | Notes |
|------|----------|-------|
| Security question text | `p.fnt-size-20 em.ng-binding` | `<em>` inside `<p class="fnt-size-20">` |
| Security answer input | `input[name="answer"]` | text input, `autocomplete="off"` |
| Security answer submit | `button[type="submit"].a-button` | text: "Validar" |
| Password input | `input[name="password"]` | |
| Password submit | `button#btn_enter` | id is stable |

### Security question Angular scope
```js
angular.element(document.querySelector('form')).scope().sqCtrl.flow.securityQuestion
// → "¿Cuál es el nombre de la primera compañía para la cual trabajaste?"
```

---

## Dashboard (accounts overview — `/group/guest/dashboard`)

| Element | Selector | Notes |
|---------|----------|-------|
| Each account row | `.bgp-dash-table-item` | `ng-repeat="account in product.accounts"` |
| Navigation href | `a[href*="/group/guest/"]` within row | first anchor in item |

### Angular scope per `.bgp-dash-table-item`
```js
angular.element(row).scope().account
```
Key fields:
- `number` — portal UUID (use as `BankAccount.id`)
- `maskedNumber` — display number (e.g. `04-03-99-923486-8` or `**** 6155`)
- `name` — display name / alias
- `classType` — `SavingsAccount` | `CheckingAccount` | `CreditCard` | `BGProfuture`
- `currentBalance` — float, e.g. `987.88`
- `availableBalance` — float
- `sequence` — integer used in the navigation URL `?origin=N`

### Navigation URL patterns
- Savings/Checking: `/group/guest/detalle-de-cuenta-de-ahorro?origin=N`
- Credit Card: `/group/guest/detalle-de-tarjeta-de-credito?origin=N`
- Pension (skip): `/group/guest/detalle-de-profuturo?origin=N`

---

## Savings/Checking transactions (`/group/guest/detalle-de-cuenta-de-ahorro?origin=N#!/account`)

| Element | Selector |
|---------|----------|
| Transaction rows | `[ng-repeat="movement in accCtrl.product_movements"]` |

### Angular scope per row
```js
angular.element(row).scope().movement
```
Key fields:
- `dateMovement` — Unix timestamp ms (e.g. `1772591168000`)
- `natureMovement` — `'C'` = credit, `'D'` = debit
- `amountMovement` — float amount (always positive)
- `description` — transaction description text
- `id` — reference/transaction ID (e.g. `"800346461"`)
- `capitalBalance` — running balance after transaction

---

## Credit card (`/group/guest/detalle-de-tarjeta-de-credito?origin=N`)

### Tab navigation
| Tab | Selector |
|-----|----------|
| Current period (tab 1) | `a[href*="#menu1"]` |
| Last statement (tab 2) | `a[href*="#menu2"]` |

### Current open-period rows (tab 1)
```
[ng-repeat*="movement in cardCtrl.globalMovements.lastMovements.movements"]
```
Angular scope var: `movement` — same fields as savings movements above.

### Closed-statement rows (tab 2)
```
[ng-repeat*="statementMovements in cardCtrl.statementMovements.movements"]
```
Angular scope var: `statementMovements` — same fields.

---

## Notes

- **Deduplication**: The portal renders each `ng-repeat` row twice (desktop + mobile?). Both parsers deduplicate by movement `id`.
- **Timestamps**: `dateMovement` is ms since epoch. Convert with `new Date(ms)` to get local time.
- **BGProfuture**: Pension plan accounts are excluded from sync (no standard transaction view).
