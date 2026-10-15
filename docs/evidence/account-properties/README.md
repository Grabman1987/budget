# Account properties

This slice exposes the existing depot-to-cash `referenceAccountId` relationship in account create/edit forms and the account API. It adds no purpose column and does not rewrite historical records. Cash remains the `cash` account type; payroll account selection remains in Einstellungen › Datenquellen.

The depot field names a separate cash account. Accounts with integrated cash leave it empty. New references are limited to `brokerage`/`crypto` owners and open `checking`/`cash`/`savings` targets in the same currency. A type change away from an owner type must explicitly clear its reference. A settlement target with active depot references cannot be retyped to an ineligible type until those links are removed. Closing a target remains supported and leaves its stored relation intact. Link changes use the existing audited account writes and undo.

The manual-cash hint is deliberately scoped to new manual cash bookings. This slice does not change import or transfer status behavior; see [verification.md](verification.md). It does not complete all of UX issue #478 or claim the wider cash-status review (K3) is complete.

## Evidence

- [Desktop create form, light theme](create-form-desktop-light-20261015100414.png)
- [WebKit iPhone edit form, dark theme](edit-form-webkit-iphone-dark-20261015100428.png)
- Axe checked the open create and edit forms in light and dark themes during those browser scenarios. Serious and critical violations were zero.
- `e2e/accounts-settings.spec.ts`: all 9 account-settings desktop/mobile cases passed. The focused create/edit/clear/undo case with form Axe checks also passed on desktop and WebKit iPhone; desktop 1440 and mobile 390 coverage includes the same flow.
- `apps/server/src/api/api.test.ts` and `apps/web/src/pages/accounts-settings.test.tsx`: 67 focused API/UI tests passed. Regressions cover invalid references, type changes, undo and existing credit-card fields.

## Full check status

An initial repository-wide `npm run check` exposed formatting issues in the new files; those were fixed. A subsequent full check passed workspace typecheck, ESLint and Prettier, then was stopped during Vitest at the lead's request to avoid duplicating the imminent integrated PR500 check. That run is recorded as interrupted for integration, not passed. The focused regression and browser runs above are complete; root will report the full integrated check separately.
