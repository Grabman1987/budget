# Requirements gaps and superseded concept statements

Reviewed 2026-10-01. This checklist distinguishes incomplete **requirements** from
unfinished **implementation** in [FEATURES](FEATURES.md). Existing calculations,
API contracts and prototypes remain binding; an open detail does not invalidate
already specified behavior or authorize a new feature.

## Confirmed decisions to propagate through the documents

| Original concept statement | Current binding decision / reference |
| --- | --- |
| `03_Mockups` and the concept's design chapter | DESIGN and `design/prototype` are the accepted design reference; owner Gate 1 sign-off is still pending |
| Name O10 open | Budget, PRODUCT decision 2026-09-29 |
| Actual migration and app CSV/XLSX imports | YNAB source; no app import UI; separate authorized private transfer; SPEC §§3,10 |
| Eight-stage waterfall | Nine stages, adding Laufender Monat; SPEC §4 |
| Old B-series report catalog | Thirty reports in five groups; SPEC §7 |
| 50/30/20 based only on expenses | Assigned-money prototype calculation, including periodic/special costs as twelfths; SPEC §§4,6 |
| We are at P0 / prototype retirement as cut-over | Current implementation is partial; retiring YNAB/PP still requires Gate 4 |
| Investment cost method unspecified | Moving-average default, optional persisted FIFO; preserve documented gains and broker source values; SPEC §10 |

Keep the original concept as a historical source, with an explicit precedence
notice rather than silently treating its older statements as current requirements.

## Details to finish before the corresponding implementation or private acceptance

| ID | Detail still to formalize | What is already specified | Concrete completion evidence |
| --- | --- | --- | --- |
| D01 | Feature-by-feature acceptance and traceability | Six packages, four gates, prototypes, 27 KPIs and 30 reports | Each FEATURES row gains task/PR, connected UI/API, independent expected values and owner acceptance; no mockup-only completion |
| D02 | Private migration inventory and mapping | EUR-first, 01.10.2023, YNAB/PP sources, cent-exact Gate 2 and Gate 3 | Private account/category/instrument mapping, backup/transfer procedure, persisted comparison and exception list; no source content in the repo |
| D03 | Remaining PP source edge cases | Integer scales, parser/type coverage and known limitations in `migration/pp-export.md`; selected cost method in SPEC | Private verification of corporate actions, deliveries/transfers and carried basis, refunds, currency units and incomplete history; report unsupported cases rather than inventing history |
| D04 | Exact private return comparison set | TTWROR, XIRR, Modified Dietz, valuation/external-flow definitions in domain/API docs | Identical PP periods, security-only vs depot/cash view, quote convention and benchmark; documented differences and their cause |
| D05 | Informational latent-tax report semantics | No tax filing or duplicate withholding; broker taxes are source data | Before report 4.5's hypothetical latent-tax display: define assumptions and labeling separately from actual taxes; do not infer a tax obligation or new booking |
| D06 | Connected-source failure/recovery contract | Bank consent warnings, stale-price inbox, deduplication intent and daily market timer | Retry/catch-up boundaries, partial failure states, reconnect UX and ownership of conflicts, verified with adapter contracts and 14 days of complete nightly runs |
| D07 | Offline synchronization contract | Installable PWA and offline queue for new bookings | Specify retry/idempotency, conflict/rejection UX, stale-data indication and recovery after reload/device interruption before implementing the queue |
| D08 | Complete routine acceptance | Capture 10s, answer Heute 5s, weekly/payday/month/quarter/year routines | Defined start/end states for each routine and checks that all proposed actions resolve the actual ledger/inbox state |
| D09 | Full KPI presentation coverage | 27 KPI names/formulas/primary locations; shared prototype overrides | Per-KPI link to accepted shared calculation, display, drill-down, missing-data behavior and correct report; preserve current source precedence |
| D10 | Real operational acceptance records | Passkeys/recovery/encrypted backups, second backup later, four required CI jobs | Owner devices, real restore, independent backup destination when provided, exact live revision and final month-end sign-offs |

These are task-specific completion requirements, not requests to redesign the app.
Read the existing prototype and domain/API documents before asking for an owner
choice; only genuinely unspecified financial/product rules need a decision.

## Deliberate scope boundaries

No app file-import wizard; CSV export remains a placeholder at this stage. No
multi-user linking, native app, AI advice/categorization, tax filing, automatic
withholding calculation or vehicle/real-estate valuation in V1. Complete coverage
of the agreed replacement workflows does not promise every unrelated upstream
YNAB or Portfolio Performance capability.
