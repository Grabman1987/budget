# Product foundation review — 2026-10-15

## Finding

Budget has an original requirements document, sitemap, data model and routine
descriptions. The problem is discoverability, historical drift and incomplete
end-to-end contracts, especially financial first use after authentication.

Subsequent owner review identified missing wealth behavior and Figma mismatches
despite complete inventories. [GAP01–08](open-gaps.md) records these as open work,
including benchmark/value/asset-history measures and semantic per-frame acceptance.
Inventory completeness is not a completed functional or visual product audit.

The original concept already contains processes (chapter 4), data model (5),
sitemap (6), pages (7), KPIs (8), reports (9) and migration/security (11).
Creating a competing specification from scratch would lose agreed behavior.

## Evidence and limits

| Source | Observation from this review | Limit |
| --- | --- | --- |
| Repository | Reviewed SPEC, PRODUCT, concept, feature/gap/acceptance/status documents, router, setup components, account form and data model at `01a10de8` | Source inspection is not financial or device acceptance |
| Live `/health` | `status: ok`, revision `01a10de8b251f3b3bb05d8a5df6ae534e7d0d631`, 2026-10-15 | Health does not prove a complete user journey |
| Live `/api/auth/status` | `setupRequired: false`, `authenticated: false` | This instance already has authentication configured; no authenticated session available |
| Live `/plan/monat` | HTTP 200 returns the application shell | No browser capture or authenticated interaction; no visual UX/a11y audit claimed |
| Figma structure | Supplied node `172:2` is Heute; expanded review discovered 17 pages and inspected target area/global/prototype metadata, linked in screen contracts | Structural references only; screen R-codes are not report/rule IDs; no visual acceptance claimed |
| Figma screenshot | Screenshot service returned a render URL for `172:3`; download blocked by network policy | Render was not inspected and is not visual evidence; no screenshot included |

No live financial data was read or changed. No passkey was registered, no setup
token used, and no production records were created. A browser tool/skill was not
available in this session; the requested planning work therefore uses source and
metadata evidence, not a completed visual audit.

The initial review used `4841e7eb`; final integration rechecked the changed
source against main `01a10de8`, including quiet historical charts, full filtered
inbox deficit aggregation and the daily portfolio index. Fresh live health matched
that integrated main revision. This remains deployment identity, not flow acceptance.

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

Drift corrected in this package: REQUIREMENTS-GAPS called CSV export a placeholder
despite the implemented ZIP; current summaries now distinguish delivery from
acceptance. SPEC's lower navigation/performance/valuation paragraphs conflicted
with its newer directives; they now refer to the current detail-page exceptions,
compact wealth summary and holding-price fallback. Current report summaries point
to 34 registered slugs; original catalog/decision history is retained as historical.
These inconsistencies were not proof that the corresponding features were absent.

## Decisions and review boundaries

Private single-user scope, manual financial editors, explicit account dates and
separate operator migration are existing boundaries; no reconfirmation is needed
to document them. [Delivery plan](delivery-plan.md) consolidates four concrete
onboarding recommendations (DEC01–04): minimum readiness, safe existing-data path,
versioned cross-device acknowledgements and optional-module handling. Initial
categories remain manual; a template is not silently added. Proposed readiness
requires product review before implementation; no financial gate has been accepted.

## Delivery order

1. Review these contracts and record DEC01–04 dispositions in SPEC/PRODUCT.
2. Produce onboarding screens in the existing design language, including empty,
   error, paused, already-populated and completed states, with mobile equivalents.
3. Implement readiness/resume behavior and reuse existing audited forms. Add only
   the persistence/API contract actually needed after agreement.
4. Verify a synthetic empty database, an existing populated database and an
   interrupted setup; test keyboard/screen-reader paths and physical-device timing.
5. Finish per-routine traceability and reconcile stale documentation in small PRs.

The current change is documentation only. It does not implement onboarding,
accept a financial gate or deploy application behavior.
