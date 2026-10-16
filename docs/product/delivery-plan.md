# Delivery plan and decisions

This work completes the planning package. The packages below are reviewable
implementation/acceptance tasks, not a promise that this docs PR implements them.
The subsequent owner gap review identified functional/design omissions even with
complete inventories. [GAP01–08](open-gaps.md) are now explicit open packages;
PLAN01 completion does not establish semantic or visual feature completeness.

## Defaults carried forward

| Decision | Basis / result |
| --- | --- |
| Product scope | Existing private single-owner PWA; contacts have no login |
| Documentation home | `docs/product/` indexes existing authoritative contracts; no competing financial specification |
| Design ownership | Existing blueprint language and specific Figma nodes; no unreviewed visual redesign |
| Migration | Separate explicitly authorized private operation; no in-app file importer |
| Financial rules | Preserve SPEC directives, shared calculations, audit/undo and locks |
| Initial categories | Existing manual creation remains the safe baseline; no sample household silently installed |
| Initial dates | Owner explicitly reviews the account date; existing migration date is confined to that migration |

## Proposed onboarding decisions for review

| ID | Concrete recommendation | Consequence and remaining approval |
| --- | --- | --- |
| DEC01 | Readiness means usable account/category basis plus current explicit plan/summary review | Allows an intentional zero-cash start; does not pass any financial gate. Proposed product finish condition |
| DEC02 | Existing populated installs get a nonblocking review; manual fresh start is supported through existing editors | No forced replay or financial reset; operator-assisted migration remains separate |
| DEC03 | Store only versioned choices/acknowledgements in the existing settings mechanism with concurrency protection | Server survives device switch; no duplicate financial fields. Proposed technical design, verify against implementation constraints |
| DEC04 | Optional sources/debts/holdings are later tasks with explicit incomplete status | Base budgeting works without bank/investment setup; no false complete forecast |

The user's request authorizes completing the planning work. It does not establish
owner acceptance of new financial readiness rules or Gates 1–4. These four
recommendations are concrete review points, not unresolved placeholders spread
through the implementation. No public SaaS, template package, new telemetry or
numeric availability/restore promise is added.

## Ordered work packages

| Task | Depends on | Concrete deliverable | Acceptance / boundary |
| --- | --- | --- | --- |
| PLAN01 Consolidation | None | Requirements, lifecycle/data, current sitemap, report/metric contracts, traceability and evidence plan | Documentation validator, links, source drift review and required repository checks; this PR |
| ONB02 Agree readiness | PLAN01 | Record DEC01–04 dispositions in SPEC/PRODUCT; approved minimal checklist contract | Owner decision linked; unresolved choice never disguised as implemented behavior |
| ONB03 Design first use | ONB02 | O01–O08 desktop/phone screens and state variants using [screen contracts](screen-contracts.md) | Entry/exit/back/focus/error/resume and existing-data path reviewed; no invented node IDs |
| ONB04 Progress read/write | ONB02 | Validated read model, versioned acknowledgements, conflict handling and existing settings persistence | AC05/24/25, auth/recovery restrictions, rollback and no ledger mutation |
| ONB05 Connect checklist | ONB03–04 | Nonblocking entry from Heute/settings and reuse existing account/category/plan editors | Empty/zero/populated/paused states, no duplicated forms or openings; AC03–05/24–25 |
| ONB06 Handover and evidence | ONB05 | Reviewed summary, optional work links, repair state and desktop/phone evidence | AC22/24/25, physical device checks, no financial-gate substitution |
| QUAL01 Routine acceptance | PLAN01 | Execute PR01–08 contracts with exact start/end/resume evidence | [Journeys](journeys.md) and AC matrix; fix only demonstrated current gaps |
| QUAL02 Source/FX/offline reconciliation | PLAN01 | Current implementation versus D06/D07 and operation evidence | Source policy/catch-up, uncertain replay and incomplete-history cases; no old absence assumptions |
| QUAL03 Private gates | Existing owner/source access | Separate scoped reconciliation and acceptance records | Gates 1–4 unchanged; no private data in repo or CI |

## Open gap implementation sequence

1. GAP08 establishes scope/measure/design authority; GAP04 diagnoses the existing
   net-worth chart independently. These are prerequisites/diagnosis, not a new graph.
2. GAP01/GAP02/GAP03 deliver compact benchmark, actual EUR history and asset-group
   history using the shared data contracts. Each has its own AC26–28 evidence.
3. GAP05 reconciles navigation/terms; GAP06 reuses ONB02–06; GAP07 records the
   semantic frame/source/acceptance result throughout. AC29–31 protect the distinction.

All remain unchecked in ROADMAP/TASKS. The owner's three wealth targets are
requested product scope; detailed read-model/UI design and existing onboarding
DEC01–04 dispositions remain part of the linked implementation preparation. Owner 2026-10-16: DEC01–04, ONB02–06 and AC24/25 are deferred to PUB1 (#490); no onboarding is built while the app is unpublished.

## Definition of implementation readiness

Each task names requirement/AC IDs, entry/exit routes, existing design reference or
explicit missing frame, data/API contract, validation and failure behavior,
financial write/undo boundary and concrete evidence. A routine that merely links
unrelated screens is not a complete guided journey. New unclear product rules
must be resolved under CLAUDE.md before implementation.

## Review and release

One coherent task/branch/PR; keep the product contract and implementation linked.
Run focused meaningful regressions, then required full checks. UI work also needs
the required browser/design/device evidence. Draft PR, review, merge, deploy and
owner acceptance are separate states. This docs change is not merged/deployed by
the instruction to finish planning.

## Maintenance and completion criteria

PLAN01 is complete when every current functional family, legacy Y/I feature,
registered report and original KPI has a mapped contract/reference; current
rules and fixed navigation are inventoried; no proposed screen/API is called
existing; relative links/IDs/source inventories validate; conflicts have precise
precedence notes; and the remaining execution/owner evidence is explicit.
Completion here means the documentation package is reviewable and comprehensive,
not that every private financial result or external system has been accepted.
