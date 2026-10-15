# Account properties

This slice exposes the existing depot-to-cash `referenceAccountId` relationship in account create/edit forms and the account API. It does not add a purpose column or change historical records. Cash remains the `cash` account type; payroll account selection remains in Einstellungen › Datenquellen.

The depot field names a separate cash account. Accounts with integrated cash leave it empty. The API rejects a self-reference, a missing/deleted or closed target, and a currency mismatch; it also blocks currency changes that would mismatch an existing linked depot. Existing links remain visible in the editor even if their target later closes or changes currency; unrelated edits do not rewrite or revalidate that stored relation. Link changes use the existing audited account writes and are undoable.

Focused verification on the frozen branch:

- `apps/server/src/api/api.test.ts` and `apps/web/src/pages/accounts-settings.test.tsx`: 64 tests passed.
- Web and server TypeScript checks passed.
- ESLint and Prettier checks passed for all changed source and test files.

This does not complete UX issue #478 or verify desktop/mobile browser visuals. Booking/import status paths remain separate from this account-properties slice.
