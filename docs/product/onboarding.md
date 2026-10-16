# Financial first-use onboarding — proposal

Status: proposed contract ONB01, 2026-10-15. Not implemented or accepted scope.
Reuse the existing private single-user model and audited forms. This proposal
does not introduce public registration, bank writes or file imports.

## Three different setup processes

| Process | Responsible actor | Existing source / boundary |
| --- | --- | --- |
| Deploy and recover the installation | Operator | `docs/ops.md`: storage, secrets, restore, bootstrap enablement |
| Establish secure device access | Owner | `/setup`: one-time token, first passkey, recovery codes; later `/login` |
| Establish financial readiness | Owner, with a separate operator migration if needed | Proposed guided checklist using existing financial settings |

The reviewed `SetupRoute` navigates to `/` after access setup. That establishes
authentication, not a configured financial household. Additional device setup
must not restart financial onboarding.

## Proposed journey and completion evidence

| Step | Inputs and action | Finish condition | Optional / recovery |
| --- | --- | --- | --- |
| 0. Secure access | Existing token/passkey/recovery flow | Authenticated owner, existing recovery gate completed | Preserve current auth behavior; abort/failure never grants access |
| 1. Choose starting path | Explain manual start versus existing/private migrated data | Explicit selected path; populated ledger recognized | No upload wizard; operator migration remains a separate authorized task |
| 2. Establish cash basis | Existing account form: type, currency, budget membership, explicit opening date and amount | At least one eligible active EUR budget account with an explicitly reviewed opening, including an intentional zero | If no account is wanted yet, pause and explain the limitation; do not invent money |
| 3. Establish categories | Create/select category groups and at least one active usable spending category | Owner-reviewed usable category structure | Templates may be proposed only after agreement; never install personal sample data |
| 4. Add expected payments | Salary source/account, recurring income/outflows, due dates and rhythms | Configured items validated or explicitly skipped | Optional; do not make up a salary, payday or zero forecast |
| 5. Review first budget | Select month, inspect cash basis, assign money with existing plan controls | Owner reviews plan; unassigned money, overdrawn allocations and limitations are explicit | Zero allocation can be legitimate with zero cash; no forced income creation |
| 6. Extend if relevant | Contacts, debts, depots, holdings, targets and data-source connections | Each relevant module configured or marked later | Optional; unresolved valuation/history remains provisional |
| 7. Hand over to daily use | Summarize ready items, skipped items and next routine | Owner acknowledges summary and can return to the checklist | Real booking is not required; use a separate synthetic test environment for demonstrations |

Recommended presentation: a short checklist reachable from Heute and settings,
with deep links into existing forms. Proposed URL `/einrichtung` is not currently
a route. Keep auth `/setup` separate. Do not design another primary navigation
area or duplicate financial editors.

## State and resume contract

Proposed states: `not_started → in_progress → ready`; `paused` resumes at the next
unresolved step. Failed actions retain the last valid state and a retry action.
Optional module choices can be `later` without pretending their data is complete.

Derive financial readiness from current validated domain data; store only explicit
choices and acknowledgements that cannot be derived. A checked UI box alone is
never proof of a valid account balance or completed financial acceptance. Agree
cross-device persistence before selecting a schema/API. Do not invent columns now.

Revalidate on resume, reload, device change and relevant financial edits. If an
account/category is subsequently removed or undone, explain the missing basis
and offer repair. Preserve ordinary app access; a resumed checklist must not trap
an existing owner or destructively repair historical data.

For populated installations: detect existing data, show what is already present,
ask only for genuinely missing choices, and require review instead of replaying
creation steps. Migration-pending state must not offer an action that duplicates
operator-created openings, trades or contacts. Never seed financial data in live
onboarding.

## Errors and business safeguards

- A repeated request/reload must not duplicate an opening or another financial
  record. Check existing request/idempotency contracts; define missing ones before
  implementation. Successful saved forms remain saved after checklist interruption.
- Validation errors stay beside fields; focus moves to a useful error summary or
  invalid field. Preserve typed values and provide a clear retry after network loss.
- Manual setup should be online for the initial release unless its offline write
  contract is explicitly specified; existing offline capture remains separate.
- Bank consent failure does not prevent manual budgeting. Source freshness and
  connection status remain visible; credentials are never checklist data.
- Debts and holdings must not become spendable cash. Credit limits do not become
  opening money. Honor the existing account type and allocation rules.
- Recovery-code loss must follow the security recovery process, not a financial
  “start over” that resets authentication or the ledger.

## Proposed acceptance matrix

| Scenario | Required evidence |
| --- | --- |
| Fresh empty installation | Bootstrap works; checklist leads to explicit cash/category/plan basis without sample data |
| Intentional zero-cash start | Zero is acknowledged; no division errors or fabricated income; next action explained |
| Interrupted setup | Reload, timeout and second device resume valid saved work without duplicates |
| Existing ledger | No rewritten dates, balances, categories, trades or credentials; no onboarding loop |
| Optional sources skipped | Manual work remains usable; missing forecast inputs are labeled |
| Save rejected or connection lost | Typed input and last saved state recover; retry does not post twice |
| Undo or account closure | Readiness recalculates; repair link is useful; historical records remain intact |
| Mobile and keyboard | 390 px and desktop layouts, visible focus, labels, screen-reader errors, 44 px targets |
| Handover | Ready summary names remaining gaps and links to weekly/month-end routines |

Use the literal synthetic examples in [requirements](requirements.md). Onboarding
completion never substitutes for Gates 1–4 or private migration reconciliation.

## Decisions before implementation

Review DEC01–04 in [delivery plan](delivery-plan.md) before implementation. Explicit
account dates and existing manual category creation are retained; templates and
public registration are not introduced. The new readiness finish condition needs
owner agreement under the repository's product rules.

## Implementation candidate: readiness and acknowledgements

Concrete recommendation DEC01–04 in [delivery-plan](delivery-plan.md). This is a
reviewable design contract, not an existing endpoint or an accepted new rule.

Derive `basisValid` from (a) at least one active eligible EUR budget asset account,
(b) an explicitly reviewed account/opening basis, and (c) at least one active
usable spending category. A credit-card limit or tracking investment alone cannot
satisfy the cash basis. Explicit zero is valid. Keep unsupported currencies visible
and explain the current limit rather than silently adding them to EUR.

Derive `ready` only when basisValid and selected first-plan month/summary acknowledgements
refer to the current reviewed basis. Show unassigned money, negative funding,
skipped modules and unavailable forecasts in that review; do not invent a new
financial correction or silently force allocations. “Ready” means base setup is
reviewed, not that every euro is assigned, every source connected or any gate passed.
If a required basis changes, show Needs review with the specific changed object.
Advancing the calendar alone never restarts onboarding. Ordinary capture, planned
monthly assignments and market movement after completion also do not invalidate
initial setup. A structural loss/change of the reviewed account/category basis
does: deletion/undo, incompatible currency or membership, or changed opening basis.
During an unfinished review, however, changed financial inputs invalidate a stale
plan acknowledgement so the owner sees the updated state before completing it.

Suggested persistence uses the existing audited settings mechanism, with a
versioned document such as `onboarding.v1`: selected start path/month, current
step, per-optional-module later/configured choices, reviewed object references
and server-derived fingerprints, last acknowledgement and concurrency revision.
Do not persist balances, secrets, raw documents or duplicate domain objects there.
The implementation must select supported transaction/undo semantics and test
size/concurrency bounds before fixing the physical representation.

Proposed API: `GET /api/onboarding` returns derived steps/readiness plus permitted
next actions. `PATCH /api/onboarding` accepts a bounded typed choice or review
acknowledgement with expected revision/fingerprint. Reject stale acknowledgements
with 409; derive readiness on the server, never accept `ready: true` from the
client. Both require the existing session and write-origin policy. These endpoints
are candidates, not part of the present route/API inventory.

Financial creation remains with existing account/category/assignment APIs. Progress
save cannot create money. After a lost financial response, resolve that operation's
actual result before allowing creation again; offline booking idempotency must
not be assumed to cover account creation. Use an operation identifier/read-back
contract if the existing endpoint cannot resolve uncertainty; do not treat names
alone as unique account identities.

## Screen and field contract

| Screen | Required input/content | Primary / secondary action and recovery |
| --- | --- | --- |
| O01 Start | Detected empty/populated/migration-pending basis; no personal sample data | “Einrichtung starten” / “Später”; existing data leads to review |
| O02 Account basis | Existing form fields: name/type, applicable currency/membership, explicit opening date and amount | “Konto anlegen” or “Vorhandenes Konto prüfen”; zero must be intentional, draft retained on error |
| O03 Categories | Existing groups/categories/class/target controls, usable selection | “Kategorien prüfen” / return to account; no automatic template installation |
| O04 Expectations | Optional actual salary source/account and recurring schedules | “Zahlungen einrichten” / “Später”; no assumed salary/payday |
| O05 First plan | Month, shared cash/envelope figures, unassigned/underfunded warnings and existing assignment controls | “Plan prüfen”; apply remains explicit; preserve current domain guards |
| O06 Optional work | Contacts/debts/depot/source cards as concise tasks with completeness reasons | “Einrichten” / “Später”; opening a module does not complete it |
| O07 Summary | Reviewed basis/date/month, optional gaps and first weekly/month-close links | “Zu Heute”; acknowledge only current server fingerprint |
| O08 Resume/repair | Last saved step and exact stale/missing basis | “Fortsetzen” or targeted “Prüfen”; never “Alles zurücksetzen” for financial repair |

Validation copy distinguishes “Bitte Anfangssaldo und Datum prüfen”, “Deine Daten
haben sich geändert. Bitte prüfe den Stand erneut.” and “Keine Verbindung. Deine
bereits gespeicherten Daten bleiben erhalten.” A local draft must not be described
as server-saved. Announce errors/status without exposing masked amounts.

Back navigation retains valid choices, a dirty form uses the existing guard,
focus returns to the initiating task after a dialog, and the stepper exposes
current/completed/pending states in text. Phone uses the same tasks/content with
44 px controls and no mandatory horizontal form scrolling. O01–O08 need new
reviewed frames; related existing F/E/S frames are references, not proof of an
existing onboarding design.
