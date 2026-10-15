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

Agree minimum readiness, manual start-date policy, priority of manual versus
operator-assisted start, cross-device progress persistence, and whether initial
categories are entirely manual or an explicitly reviewed generic template.
These decisions need owner agreement under the repository's product rules.
