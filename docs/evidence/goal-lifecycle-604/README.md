# #604 goal funding and retained lifecycle

**Integration owner:** the local chat “Merge-Konflikt753” owns the serial integration. Cloud writers remain stopped. The preserved cloud checkpoint below is historical. Local source/adapter/integration review is CLEAR at `90273f2ac211243e3e32b47a1ca46858d800f1f7`; the15 legacy goal scenarios,15 Chromium/WebKit lifecycle cases and67financial/migration/compatibility checks pass. The final narrow Linux run passes15/15, including the previously failing mobile click; all four intended images are regenerated at65fc79fe. Final full CI remains required. See [current follow-up](CI-FOLLOWUP.md), [new original browser proof](final-browser/proof.json), [Linux proof](final-linux.json), and the preserved [handoff](HANDOFF.md). No merge/live/completion claim.

The bounded #604 package adds explicit goal start months, current-month Plan funding, and retained reached/completed lifecycle state with guarded manual completion. Funding assigns only the missing monthly amount through the existing writer; completed goals and bookings remain available for history and Undo. Prospective automatic completion requires proven goal reach followed by a first actual expense. The separate future-only forecast remains intact.

## Exact revisions and validation

| Revision | Recorded result |
| --- | --- |
| `97313b4a0290a2accf930e1417f5aaf762801713` | 3 new domain/migration/repository suites: 25 passed. Initial compatibility run: 40 passed, 6 failed; diagnosed and repaired with bounded adapters/source correction. |
| `dc5ddf784e0b5a4713499b4631083dc4a7c1e0a2` | 6 existing compatibility suites: 46/46 passed; new API/history candidate had one omitted-future-null-points mismatch. |
| `3b44ddce44e4552b60821ae76963a14bc3e24be4` | New API lifecycle coverage: 2 passed; server types passed. Earlier at `dc5ddf7`, all other workspace types passed. |
| `0eaf612b3c0be59b088a61f1de7fd8110e1a06cd` | Goals model: 9 passed; scoped lint, format, build passed; native Playwright: 7/7 passed. |
| `6c521d2cbd93b8c364cb5905f38fedff39ee9680` | Final toast-only adjustment; final native Playwright: 7/7 passed in 1.3 minutes; build passed. Four synthetic desktop/phone, light/dark captures are recorded in [proof.json](native/proof.json). |

Complete CI has not passed. The goals snapshot workflow run `39775332788` completed with overall success, but its actual Playwright annotation reports **12 passed / 3 failed**; regeneration uses `|| true`. This is not CI acceptance. Migration 48 was tested against a populated copy for preservation, rollback/re-upgrade, and refusal cases; no user database was migrated.

## Review and adoption boundary

Independent source review is CLEAR through `0eaf612b` for the lifecycle/API/UI/migration changes and reviewed technical adapters. The final `6c521d2c` message-only adjustment has root-owned native verification; source review is not a substitute for pending CI or broader acceptance. See [REVIEW.md](REVIEW.md), [validation.json](validation.json), [ADOPTION.md](ADOPTION.md), and [native proof](native/proof.json).

Four existing test files have narrowly documented technical adapters: `packages/db/src/repos/goals.test.ts`, `apps/server/src/api/goals.test.ts`, `apps/web/src/budget/goals-model.test.ts`, and `e2e/goals.spec.ts`. Legacy adopt/Undo fixtures remain truly pre-sync; original target amounts, dates, and post-Undo absence assertions remain. Goal model expectations follow reached-first grouping while preserving monetary totals. E2E retains future-rate amounts, deficits, sum and Undo checks; the retired adopt-button UI coverage now exercises the retained authenticated API action and exact financial Undo result. No protected financial assertion, lock, audit, timeout, tolerance, or screenshot baseline was weakened.

Owner-approved behavior is current-month-inclusive Plan rate assignment, selectable goal start, and explicit completion after a proven reach; automatic completion is restricted to a proven first actual expense. Existing history, target association, audit, and Undo contracts remain in scope. The reviewed acceptance uses synthetic data only and includes no real provider or personal data.


## Native image provenance and limits

All four images under `native/` are byte-for-byte originals from the final
synthetic `6c521d2c` WebKit run; their SHA256 values were checked against
`native/proof.json` while copying. The desktop and390px scenes cover both themes.
Root inspected the prior long-toast phone defect and requested the concise
completion toast; final images need root visual acceptance. Browser emulation
does not establish physical-device behavior. No private PDF, authentication
state, production database, raw runtime log or trace is included.

The snapshot workflow checks out the requested feature branch even though its
workflow dispatch metadata reports main's workflow SHA. Workflow success alone
does not establish Playwright success because regeneration deliberately uses
`|| true`; actual test results and changed PNGs must be inspected separately.


## Linux baseline regeneration result

Bot commit `2d412ca49efcd03e6a84c512965b3293dcfd2952` is a PNG-only child of
`6c521d2c`; it was fetched normally and fast-forwarded locally after remote-head
verification. Exactly four `e2e/goals.spec.ts-snapshots/sparziele-{light,dark}-{desktop,mobile}-linux.png`
files changed. The integration owner must visually review these UNREVIEWED images; this
checkpoint push preserves evidence only and does not accept the baselines. No push, PR, merge or rerun was performed by the adopter.

The actual check-run Playwright summary reports12 passed/3 failed in1.6min:
selected-goal detail cannot find the original “Maßkette Sparziel” group on desktop
or mobile at `e2e/goals.spec.ts:62`; the original2820.11 monetary expectation is
unchanged. The mobile create/edit/delete/Undo scenario times out on a click at
30seconds. No assertion or timeout was relaxed. These are open diagnostic gates.
Full redirected job-log download was unavailable in this environment (401 during
CLI multi-request retrieval, then forbidden redirected Azure blob download).
The actual Playwright summary/failure annotations were independently retrieved
through the GitHub check-run annotations endpoint, rather than inferring success
from the workflow conclusion. Raw diagnostic annotations remain outside the repo.
