# WP-009: bounded Explorer views across devices (#624)

The owner approved database persistence of the existing Explorer query tuple on
2026-10-16 (#517; `docs/product/reference-adoption.md`). This replaces the older
local-only proposal. The feature stores named queries, never computed report rows,
amounts or a new financial calculation. CSV, templates and hub chips are out of scope.

## Storage and revision contract

`app_setting[reports.explorer.views]` contains schema version 1, at most 20 ordered
views, stable UUIDs and at most 20 recent migration receipts. Each view contains a
trimmed 1–40-character name and exactly `dim`, `cls`, `cols`, `period`, `meas` from
the existing strict Explorer parser. Unsupported fields, malformed calendar ranges,
future versions and corrupt documents fail closed. Presets and query controls remain
usable when saved views are unavailable; stored data is not overwritten.

The collection revision is the latest audit-entry ID for this setting ordered by
SQLite insertion order. It is not a revision inside the undoable JSON snapshot.
Creation, edits, deletion, generic undo, redo, removal and recreation of the setting
all advance the token, including a return to byte-identical JSON. Mutations compare
the expected token inside the same transaction as one tracked setting mutation.
A stale token receives 409. Existing generic undo dependency/conflict guards apply;
no force-undo or unrelated financial write path is changed.

## Recoverable local promotion

Valid local views are imported as a whole batch. Equal name/query pairs deduplicate;
a conflicting name with a different query gets a bounded unique ` (lokal N)` suffix
and its own stable ID. Capacity failure rejects the entire batch without eviction,
audit mutation or acknowledgment. Invalid local entries remain locally unavailable
and recoverable; they never turn into a default or broadened query.

The server hashes the normalized batch and records its acknowledgment in the audited
setting. Recent receipts are bounded; older receipts remain in the existing append-only
audit history. An already acknowledged retry is a no-op before token comparison,
including after a lost response, later deletion or undo of imported views. This avoids
resurrecting data the owner deliberately removed. Future/corrupt settings reject an
import even when older history contains a matching receipt.

The browser removes only the captured, unchanged local source after a supported,
successful acknowledgment. Invalid pending entries stay in local storage. Transport,
server, capacity, storage and revision failures preserve the source and expose a
retry. A retry first reloads the server revision. StrictMode and unrelated refreshes
do not repeatedly dispatch the same source; no background queue loop is added.

## UI and test ownership

Views can be applied, explicitly edited/renamed, deleted, undone and redone. A
same-name save requires explicit replacement confirmation. The existing design
components, five query controls, presets and report calculation remain in place.

| File | Reason | Existing coverage/policy |
| --- | --- | --- |
| `packages/domain/src/overview/explorer-saved-views.ts` | Strict versioned query DTO and recoverable legacy parsing | New tests; existing Explorer parser unchanged |
| `packages/db/src/repos/explorer-views.ts` | Audited collection CAS and receipt-backed promotion | New tests for every mutation, rollback/conflict boundaries and undo ABA |
| `apps/server/src/api/explorer-views.ts` and API mount/export lines | Bounded authenticated preference endpoint | Existing session/origin/body-limit middleware unchanged; new API/browser proofs |
| `apps/web/src/reports/explorer-view-api.ts`, `use-explorer-views.ts`, `explorer-report.tsx` | Server query, acknowledged promotion and saved-view controls | New promotion/hook/browser tests; legacy helper tests unchanged |
| `apps/web/src/reports/explorer-report.css` | Constrain long saved names and keep edit/delete targets at least 44px | Actual 40-character/390px overflow reproduced before the fix; new strict geometry regression |
| `e2e/explorer-report.spec.ts` | Root-only per-project/per-retry name isolation after formerly local views share the sample database | Owner-approved #624 cross-device policy; independent bytewise review confirms every original action/assertion/timeout retained |
| `e2e/issue-624-explorer-persistence.spec.ts` | Separate synthetic database and two independent browser contexts | New acceptance proof; no production credentials or real financial data |

The existing E2E adaptation changes only the callback's `info` parameter, a synthetic
`viewName` variable and its four name references. The implementer did not edit existing
tests. Root applied and independently reviewed that exact delta under the owner's
existing-test authorization. No manifest, lockfile, repository rule or global HTTP
behavior is changed.

## Verification and remaining gates

`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed: **487 test
files / 4404 tests**. All workspace typechecks, CSS scale, ESLint and Prettier
checks passed; ESLint retained one existing unused-disable warning in the untouched
`packages/ui/src/components/panel.tsx`. `npm run build` and the E2E build passed.
All 18 reviewed file hashes matched before and after the aggregate check and
again after the final screenshot capture.

Targeted checks passed 6 files / 19 tests. The independent reviewer repeated that
set and separately proved audit-insert rollback, refusal of undo after an intervening
edit, and historical acknowledgment after recent receipt rotation. The final
18-file source/migration/security review is CLEAR at manifest SHA-256
`ba1109b79aa26af8e49cc4abebad8ee44563478b4d553d6f4372ce9b37b0b259`.

Real Playwright 1.64.1 WebKit 27.2 passed **9/9 selected tests** with one worker:
three setup cases, all three new acceptance cases, and all three existing Explorer
cases. The new cases verify two independent contexts through save/reload/edit/delete/
undo/redo, stable IDs, stale-write 409, unauthenticated 401 and foreign-Origin 403;
lost-ACK migration retains both conflicting versions and invalid local data; and
all three controls of a forty-character unbroken name stay within the 390px card
with width and height at least 44px. The existing cases retain their light/dark Axe,
page-overflow and screenshot checks. No retries or assertion tolerances were changed.

The long CRUD case initially exhausted its new test's default 30-second total budget
after successful save/edit/reload. It uses a bounded 90-second scenario budget and
normal focused-toast pausing while inspecting the other context; it passed in 27.1s
on the final run. Migration passed in 6.3s and long-name layout in 2.9s. The original
existing-test timeouts remain unchanged.

The long-name regression first reproduced a chip right edge of 686.5625px outside
a card ending at 374px in the 390px viewport. The scoped CSS correction constrains
the pair and wraps the label, retains 44px action widths, preserves the 13px
bookmark and squares the middle button's joined edge. The strict final layout case passes; report table styles and
design tokens are unchanged. A final narrow rerun after preserving the icon size passed 4/4 selected cases
(one layout case plus three setup cases), with no skipped, flaky or unexpected tests.
The card spans x=16–374px; the label button spans x=31–271px (240px wide), edit spans
x=271–315px and delete x=315–359px (44px each). All three controls are 94.75px high;
the bookmark is exactly 13×13px. Before/after screenshots, the exact geometry JSON
and complete browser logs are retained outside the repository under the task's
cloud-control evidence folder.

The original Explorer spec is not selected by the canonical WebKit project's match
pattern. Its three existing cases were verified using a temporary byte-identical
copy under an issue-number filename in the same directory, with identical fixtures,
assertions, configuration and engine. Discovery confirmed all three cases. The
selection adapter was removed after the run and is not part of the change; this is
not claimed as normal canonical discovery of the original file.

The independent review also covers the root-owned existing-test isolation delta.
There is no SQL schema or manifest migration. After the green aggregate, only this
evidence document and the approved images/runtime-proof JSON are added or updated;
product and test sources retain the reviewed hashes.

## Desktop and mobile screenshot evidence

A temporary read-only evidence case passed separately: **one case plus three setup
cases**, with no skipped, flaky or unexpected tests. It used the same isolated
synthetic ledger, authenticated fixture and fixed day. It ran strict light/dark
Axe and overflow checks around the saved-view edit controls in both contexts.
The temporary selector was removed after capture; its executed source and JSON
report remain in the task's external evidence folder.

Desktop is a real WebKit 27.2 **Desktop Safari layout diagnostic** with an actual
1440×900 context, explicit `isMobile: false`, `hasTouch: false` and
`deviceScaleFactor: 1`. Runtime assertions verified a fine pointer, zero touch
points and pixel ratio 1. Mobile uses the unchanged canonical iPhone 13 context:
390×664 visible viewport, 390×844 screen. This is not Chromium or Windows CI
acceptance. Capture source is base `e037acead749623271b62b70fcc4b9dfe8eabec3` plus
the unchanged reviewed 18-file tree identified above; results-doc/image additions
after capture do not change that product/test source.

| Layout | Light | Dark |
| --- | --- | --- |
| Desktop Safari, 1440px | [Screenshot](624/explorer-saved-desktop-safari-1440-light.png) | [Screenshot](624/explorer-saved-desktop-safari-1440-dark.png) |
| Canonical iPhone WebKit, 390px | [Screenshot](624/explorer-saved-mobile-safari-390-light.png) | [Screenshot](624/explorer-saved-mobile-safari-390-dark.png) |

[Actual engine and desktop semantics](624/browser-layout-proof.json).

Final independent evidence-document/image review, required Windows and Chromium
CI, serial integration and exact deployed-revision verification remain delivery
gates. Local success does not mark #624 or its parent accepted or live.
