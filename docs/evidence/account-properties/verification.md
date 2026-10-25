# Account properties verification

The settings form edits the existing account type and its optional `referenceAccountId`; no new purpose field or provider-specific value is introduced. Changing an owner away from `brokerage`/`crypto` clears the selection in the form. The API accepts a reference only for those owner types and only to an open `checking`, `cash`, or `savings` account in the same currency. A type change that leaves an existing reference must explicitly clear it. Existing historical references remain untouched by unrelated edits.

Changing a referenced settlement account to an ineligible type is rejected until dependent depot links are explicitly removed. Closing a settlement account remains allowed and preserves the reference history.

The cash hint is scoped to “Neue manuelle Bargeldbuchungen sind sofort bestätigt.” This package does not alter cash status rules for imports or transfers. In the current implementation, booking and transfer schemas default status to `confirmed`; UI capture selects `pending` for bank accounts and `confirmed` for cash. Transfer creation copies its common status to both legs; split-transfer partner creation carries the input status. YNAB import maps source cleared status and marks opening balances `confirmed`. These distinct paths remain unchanged, so the hint makes no claim about them.

K3 remains open for the broader cash-status/import/transfer review. This package does not claim the full cash status issue is resolved.

## Verification

- API/UI regression tests: `apps/server/src/api/api.test.ts`, `apps/web/src/pages/accounts-settings.test.tsx`.
- Browser scenario: `e2e/accounts-settings.spec.ts`, covering creation with a separate settlement account, clearing on retype, and undo restoring the type and relation. Playwright produces screenshots for the create and retyped forms at its desktop and mobile projects.
