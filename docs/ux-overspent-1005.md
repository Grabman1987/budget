# UX-4a — One definition of overspent, 2026-10-05

`overspentEnvelopes(month)` selects envelopes with negative available cents from
the computed month. Existing budget/carry and cash/card rules stay authoritative.
Heute attention, Plan triage/group/month counts, Posteingang and its common badge
use this definition. The badge remains a total of all open work, including each
overspent envelope once; it is not an overspending-only count.

The inbox's old single synthetic warning referred to a category, not a bank
overdraft. Stored overspending summaries are superseded by live envelope tasks,
without deleting stored history or creating bookings. Covering removes the task;
undo restores it. Each task links to the matching month/category in Plan and
cannot be acknowledged away. Card account balances remain neutral ink; negative
category envelopes caused by card spending still count and remain red.

The minimal shared change is one pure domain selector/export. No dependency,
migration, provider request or unrelated shared refactor is added.
The receipt API test funds its spending category so its existing inbox-count
assertions continue to isolate unlinked receipts; receipt implementation is unchanged.

## Current top-bar link semantics (#237)

The status chip links directly to the current month's Plan triage (`/plan/monat`
with the current `monat` and `ansicht=triage`). It opens no popover or content
sheet and performs no write; covering and undoing an envelope happen in Plan.
While its budget query has no data, it shows no numeric count or zero claim. On
any query error, including a failed refetch with cached data, it replaces the
status with a neutral Plan link instead of presenting that cache as current.
The count remains available if the cent total is unsafe, but the total is shown
as unknown. Amount privacy applies to both visible and accessible amounts.
The focused synthetic cover/undo evidence and captures are in
[top-bar Plan triage evidence](evidence/topbar-plan-triage-237/README.md).

## Checks

- Unit: negative-cent boundary, zero, ordinary reset and explicit negative carry.
- API: one synthetic month, two negative envelopes (cash/card), existing card
  debt, previous-month reset, duplicate stored warnings, every consumer, cover
  and undo, refusal of derived acknowledgement.
- Browser: `overspent-counts.spec.ts` checks actual consumer APIs and visible
  counts, Heute top-two expansion without duplicates, Plan triage, inbox badge,
  and the category-specific repair link at 1440/390 px.

## Affected Linux baselines

No screenshot baselines are regenerated locally. Review desktop and mobile:

- `expected.spec.ts-snapshots/expected-{light,dark,income-dark,panel-light}-*-linux.png`
- `goals.spec.ts-snapshots/sparziele-{light,dark}-*-linux.png`
- `networth.spec.ts-snapshots/vermoegen-netto-{light,dark}-*-linux.png`
- `rules.spec.ts-snapshots/regelwerk-{light,dark}-*-linux.png`
- `shell.spec.ts-snapshots/shell-heute-{light,dark}-*-linux.png`

These sample pages may change through the live common inbox counter. Shell
baselines mock the header counter to nine, but their frozen Heute payload reads
the live attention count. Auth/component baselines
have no live inbox. New Heute/Plan/inbox captures are test output, not baselines.

## Owner steps

Review Linux CI images and compare the same month in Heute, Plan and Posteingang.
Check one cover and undo on the owner's device. No keys, consents, migrations or
provider setup are required. Merge and deployment remain outside this task.

Synthetic local evidence: [desktop 1440](evidence/ux-overspent-1005/desktop-1440.png)
and [phone 390](evidence/ux-overspent-1005/phone-390.png).

## Local verification

The full `npm run check` was run once with `VITEST_MAX_WORKERS=2`: all workspace
typechecks and lint/formatting passed; 341 test files / 3218 tests passed, with
one receipt-count fixture failure (one unlinked receipt plus one newly derived
overspent envelope). The category is now funded in that receipt test without
changing its assertions. The affected file passed all six tests on its isolated
rerun; the server typecheck and focused lint also passed. Production and E2E
builds exited successfully. The full check was not restarted.

The broader browser run completed 18 checks with one planned mobile-backdrop
skip, then hung during Windows child-process cleanup and was interrupted.
The final targeted desktop/mobile count and Plan-view run finished normally:
`4 passed (36.0s)`. Local-only ignored configuration used the existing bundled
synthetic seeder because this sandbox's `os.userInfo()` fails with `ENOMEM` in
the ordinary `tsx` starter. Neither test assertions nor committed Playwright
configuration were changed for this workaround. Linux visual comparison remains
a separate CI/owner review; baselines are untouched.
