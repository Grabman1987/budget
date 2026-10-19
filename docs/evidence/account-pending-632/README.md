# Pending account bookings — #632 verification

Proof-only regression for the existing account register; no product behavior or
financial rules changed. Runtime source was live main
`6eb9972a41bee82c7a957e66f9e3a9fcb5c422a7` plus NEW
`e2e/issue-632-pending-account.spec.ts`, SHA-256
`6b305c8ab2e4c0f4d50b1b33ee51c92d1ab32e4d7b32cd22fb66e223a097fa64`.
Later evidence/checkpoints and mechanical main updates do not make this historical
run exact-head CI evidence. #632 remains open until all delivery gates pass.

## Independent literal scenario

Only synthetic disposable isolated-ledger data is used. Checking account A starts
at 100000 cents, with a pending −1234 and a confirmed −567 booking: its literal
balance is 98199 cents. Account B starts at 50000 with its own pending −890
sentinel: 49110 cents. A separately planned 2500-cent payment remains the existing
collapsed #579 upcoming occurrence, never another persisted booking.

An explicit confirmed-only global filter is followed by opening and reloading A.
Both distinct A booking IDs and their existing pending/confirmed controls must
appear once; B must stay absent. Actual A history requests have no status filter.
Opening, theme changes, upcoming disclosure and edit-dialog open/close leave every
raw booking/split/audit row and ID unchanged, with no financial browser write.

Only the explicit existing pending-status click may PATCH that row to confirmed.
One matching audited update is required; all financial fields, other rows, splits
and both literal balances remain unchanged. Existing undo restores pending with
one linked undo entry. Final API reads retain exactly the same three bookings,
account isolation and literal amounts. This does not add new status or money rules.

## Actual local result

- Standard `npm ci` passed on Node 22.23.3; the fresh E2E build at source6eb passed.
- Final canonical pinned WebKit iPhone run: **4/4 passed, exit0, 30.1s**, including
  three unchanged setup cases and the NEW scenario (14.1s), one worker, retries0.
  The unchanged fresh build's 169 compiled files were reused.
- Both themes passed strict whole-page Axe, overflow and phone44px targets. Raw
  no-write/audit comparisons, explicit confirmation/undo and all literal financial
  assertions passed. All3296 source files,169 compiled hashes, HEAD and dirty
  candidate status matched before and after. The helper exited and host lock was
  released. Earlier overlapping passes are not additional distinct coverage.
- Author, coordinator and independent reviewer opened both actual final images.
  Both booking rows, clock/check status icons, −12.34/−5.67 and981.99 balance are
  readable without the earlier screenshot artifact. These are genuine scrolled
  **390×664 CSS-pixel viewports** (native DPR3), not full-page compositions. The
  account title lies above the photographed viewport; it is not claimed visible.
- The physical safe JSON and attached copy were read and compared byte-for-byte:
  actual browser type `webkit`, viewport390×664, two history reads without status,
  three persisted bookings, unchanged display audit count26, and one confirmation
  plus one undo audit. Expected A/B balances are literal98199/49110 cents.

Actual final evidence:

- [Light register viewport](account-pending-light.png)
- [Dark register viewport](account-pending-dark.png)
- [Safe actual result JSON](account-pending-632-proof.json)

## Required full check and production build

After the normal merge of live main
`4752a6a36d8482750b2103c9042c8dc5c78daa0c`, the clean candidate
`8918df7cbbfcae2652c5c28a386d1e023f40b828` passed
`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check`: workspace typechecks,
lint and formatting passed; **514 files / 4,552 tests passed in 407.19 s**. The normal
`npm run build` then passed. Check, production build, source guard and actual
runner process each exited 0. Node 22.23.3 and age 1.2.1 were used; the exclusive
host lock stayed held through both stages and was released afterward.

All 3,307 tracked source/protected hashes, including the five owned files, HEAD
and clean status matched before and after. The existing panel unused-eslint-disable
warning, JSDOM `scrollTo` notices and build-size notices remain in the logs; no
rule, test or assertion was suppressed. These results precede this documentation-only
update. Exact-head CI, desktop/Chromium browser evidence and serial live delivery
remain separate gates.

## Capture diagnosis and limits

Initial full-page photographs showed duplicated skip-link paint despite passing
functional assertions. Moving both photographs before Axe did not remove it; the
initial Axe-causality hypothesis was disproven. A separate read-only observer
recorded one unfocused, offscreen skip link (rect−76…−32) and a clean genuine
viewport at scroll503. Real document-top captures also lacked duplicated links;
full-page images positioned fixed navigation within the tall document capture.
The evidence supports a capture-path/scroll dependency, not duplicate application
DOM. The exact engine raster mechanism is not claimed. No CSS hiding, focus/blur
mutation or product fix was used. The final NEW test scrolls its first history row
into view and takes both genuine viewports before the unchanged strict Axe passes.

The initial JSON engine fallback also mislabelled the iPhone device configuration.
The final NEW test reads the actual browser type directly; historical incorrect
JSON and photographs remain preserved outside the repository, not republished as
final evidence. Authentication uses the existing synthetic fixture and is not new
authentication assurance. No real data, production access or credentials are used.

## Remaining gates

Local browser proof is **phone WebKit only**. Canonical desktop1440 and Chromium
mobile390 execution, exact-head CI, controlled integration/live verification and
all issue acceptance criteria remain required. The full check and production build
above belong to frozen `8918df7c`, before the documentation-only result update; they do
not substitute for those remaining gates. No local desktop/Chromium, completed
acceptance, PR, merge, deployment or issue closure follows from these results.
Existing tests, product source, rules, configuration, manifests and lockfiles are
unchanged.
