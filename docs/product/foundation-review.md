# Product foundation review — 2026-10-15

## Finding

Budget has an original requirements document, sitemap, data model and routine
descriptions. The problem is discoverability, historical drift and incomplete
end-to-end contracts, especially financial first use after authentication.

The original concept already contains processes (chapter 4), data model (5),
sitemap (6), pages (7), KPIs (8), reports (9) and migration/security (11).
Creating a competing specification from scratch would lose agreed behavior.

## Evidence and limits

| Source | Observation from this review | Limit |
| --- | --- | --- |
| Repository | Reviewed SPEC, PRODUCT, concept, feature/gap/acceptance/status documents, router, setup components, account form and data model at `4841e7eb` | Source inspection is not financial or device acceptance |
| Live `/health` | `status: ok`, revision `4841e7ebd6cd315279d4e0063fbe4b416c2a7283`, 2026-10-15 | Health does not prove a complete user journey |
| Live `/api/auth/status` | `setupRequired: false`, `authenticated: false` | This instance already has authentication configured; no authenticated session available |
| Live `/plan/monat` | HTTP 200 returns the application shell | No browser capture or authenticated interaction; no visual UX/a11y audit claimed |
| Supplied Figma node `172:2` | Metadata identifies the page “21 · HEUTE · Überblick und Prognose”, with H01–H05 desktop/phone frames | It is a Heute reference, not a complete inspected app blueprint |
| Figma screenshot | Screenshot service returned a render URL for `172:3`; download blocked by network policy | Render was not inspected and is not visual evidence; no screenshot included |

No live financial data was read or changed. No passkey was registered, no setup
token used, and no production records were created. A browser tool/skill was not
available in this session; the requested planning work therefore uses source and
metadata evidence, not a completed visual audit.

## Prioritized gaps

| ID | Priority | Evidence and implication | Concrete next result |
| --- | --- | --- | --- |
| PF01 | P0 | Setup creates a passkey, shows recovery codes and navigates to `/`; no financial onboarding gate in the reviewed router/setup path | Agree and implement the first-use contract, not another login screen |
| PF02 | P0 | Source precedence exists, but requirements and historical delivery notes are scattered | This entry point, current-source sitemap and explicit requirement states |
| PF03 | P0 | A feature list is not a complete acceptance chain; D01 already identifies traceability work | Connect each changed function to an independent expected example, route, design, API and evidence revision |
| PF04 | P1 | Concept lists eight routines; D08 calls for complete routine acceptance | Define prerequisites, finish conditions, partial failure, resume and owner evidence per routine |
| PF05 | P1 | Authentication bootstrap and deployment setup exist; an empty usable financial state is a separate concern | Separate operator deployment, device access, manual financial setup and private migration |
| PF06 | P1 | Old text conflicts with newer directives: side panels, report counts, CSV import/export | Resolve affected summaries using SPEC precedence; retain dated historical material |
| PF07 | P1 | D06/D07 cover source/offline failure contracts, while STATUS records later implementation | Reconcile contracts against current implementation before calling features absent or complete |
| PF08 | P1 | Device, private ledger equality and parallel close evidence remain separate gates in STATUS | Collect outstanding evidence with its exact revision; do not infer sign-off from code |

Examples of drift: REQUIREMENTS-GAPS still calls CSV export a placeholder while
SPEC and STATUS describe the implemented authenticated ZIP export. PRODUCT and
older concept navigation describe panels while the 2026-10-05 SPEC directive
requires detail pages, with later explicit Plan/search exceptions. Older headings
refer to 30 reports while the current catalog contains 34. These are documentation
conflicts, not proof that the associated current features are missing.

## Product decisions still needed

1. Confirm that this work remains private single-user V1. Public registration,
   organizations, invitations, billing and multi-user permissions change scope.
2. Agree the minimum first-use finish condition in [onboarding](onboarding.md).
   Recommendation: an explicit manual initial account balance/date, a usable
   category and a reviewed first plan; integrations and portfolios stay optional.
3. Decide whether manual financial setup is useful for a fresh owner installation,
   or whether the primary path is operator-assisted private migration. Both can
   reuse existing account/category interfaces; neither authorizes an import wizard.
4. Decide which onboarding progress must survive across devices. Recommendation:
   server-persisted explicit choices, financial readiness derived from ledger state.
5. Confirm manual-start date policy. Existing private migration uses 2023-10-01;
   do not silently apply that historical migration date to every new account.

These are proposed decisions. No financial rule or scope decision has been changed.

## Delivery order

1. Review these contracts and resolve decisions 1–5 in SPEC/PRODUCT.
2. Produce onboarding screens in the existing design language, including empty,
   error, paused, already-populated and completed states, with mobile equivalents.
3. Implement readiness/resume behavior and reuse existing audited forms. Add only
   the persistence/API contract actually needed after agreement.
4. Verify a synthetic empty database, an existing populated database and an
   interrupted setup; test keyboard/screen-reader paths and physical-device timing.
5. Finish per-routine traceability and reconcile stale documentation in small PRs.

The current change is documentation only. It does not implement onboarding,
accept a financial gate or deploy application behavior.
