# Security review — 2026-10-02

Status: in progress on the isolated security-review branch, based on `e2814bc`.
This is a time-bounded source review with synthetic regression tests, not a
production penetration test or a security certification. No production access.

## Scope and method

Review the complete server source inventory, prioritising passkeys/WebAuthn,
sessions, export step-up, CSRF, rate limiting, validation, SQL, response headers,
ZIP/CSV export, error handling and dependency advisories. Review excluded import,
market and deployment paths read-only; record findings without changing them.
No database migration or real financial data is permitted.

## Initial findings pending regression verification

| Severity | Location | Failure scenario | Proposed correction |
| --- | --- | --- | --- |
| Medium | `apps/server/src/app.ts` API middleware | Ledger responses have no explicit cache prohibition, unlike auth/export responses; private financial JSON may remain in browser HTTP caches. | Set `Cache-Control: no-store` for every API result, including rejected requests. |
| Medium | `apps/server/src/auth/config.ts` origin parsing | A production HTTP origin silently selects a non-Secure session cookie and permits an insecure login configuration. | Fail startup for non-HTTPS production origins and malformed origin components. |

## Verification

Pending installation, targeted regression tests, dependency audit and full
`npm run check`. Findings, exact line references and reviewed coverage will be
updated as evidence is collected. No acceptance or clean-audit claim yet.

## Owner questions

None identified at this stage. Risky or excluded-path findings will be recorded
here instead of silently changing their contract.
