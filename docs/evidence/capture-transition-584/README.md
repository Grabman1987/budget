# Capture line transition — #584

The existing capture model already used the head total for one gross line and
showed gross line amounts only from two lines. This packet adds the missing real
one → two → one and odd-cent UI acceptance evidence; it retains those financial
rules and the existing booking/Undo writers.

The first canonical WebKit run passed its functional checks but root's original
image review held acceptance: after the invalid Ctrl+Enter attempt, the old
remainder error stayed red even when the split was valid and Save was enabled.
That functional PASS / visual HOLD remains part of the record. The correction
suppresses only the exact local remainder-save error when the current split is
no longer blocked. Other split, category, backend, account, date and locking
errors retain their existing handling; there is no broad error-state clearing.

## Corrected evidence

On corrected source checkpoint `3a1210cc`, the actual canonical WebKit run passed
**7/7 in 81.135 s**: three setup cases and four feature cases, covering desktop
1440 × 900 and the configured iPhone viewport 390 × 664 in light and dark.
The NEW `e2e/issue-584-capture-transition.spec.ts` uses an isolated real ledger,
authenticated real setup/API requests and direct SQLite readback; no request mocks.

- One gross line has exactly one amount input. Two lines expose their own fields;
  600 + 399 against total 1000 leaves literal Rest 1 cent, disables both Save
  actions, and refuses the real Ctrl+Enter attempt without a booking POST or row.
- Correcting to 600 + 400 removes the stale error. Removing line two retains the
  1000-cent head total, removes gross line inputs and leaves the category valid.
  Real Save posts one split of −1000 cents.
- A second real UI Save posts the literal −1000-cent total as −334/−333/−333.
  Both saves are checked through API and SQLite; each public Undo removes the
  booking and restores the account from 99000 to its literal 100000-cent start.
- Scoped dialog Axe, phone 44px target dimensions, body/page horizontal overflow
  and transition screenshots are checked. Root personally inspected all four
  corrected one-after originals and two odd-cent originals; the stale error is gone.

## Unchanged browser originals

These four PNGs are byte-identical copies of the corrected run's `one-after`
attachments indexed in `584-stale-error-webkit-seven-second-actual/original-artifacts-index.json`.

| Profile | Light | Dark |
| --- | --- | --- |
| WebKit desktop 1440 × 900 | [One line after removal](one-after-desktop-light.png) | [One line after removal](one-after-desktop-dark.png) |
| WebKit iPhone 390 × 664 | [One line after removal](one-after-configured-light.png) | [One line after removal](one-after-configured-dark.png) |

The dialog body scrolls: these captures show a particular scroll position, not
all odd-cent rows visible at once. iPhone emulation does not establish physical
device, physical keyboard or fullscreen-keyboard behavior; #586 remains separate.

On frozen source `3a1210cc3ddb229f00094cd6e851280335ae224c`,
`BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` passed
589 files / 5213 tests; `npm run build` passed. The running check completed
normally before handoff. Chromium/required CI, integration and verified LIVE
remain pending. This preservation does not claim completion or LIVE.

## Delivery continuation, 2026-10-21

The preserved product and test bytes still match tested source `3a1210cc` exactly;
only evidence and the missing ROADMAP entry were added. Existing independent
source reviews and full-check/build results were checked against the handoff.
A fresh E2E build passed, then supplemental system Chromium 154 passed
**11/11 in 2.4 minutes** (eight desktop/mobile project cases plus three setups),
including both themes, literal cent splits, keyboard refusal, real Save/Undo,
API/SQLite readback and the original accessibility/overflow assertions. No
existing tests, timeouts, financial expectations or production code changed
during continuation. The prior full check was not rerun for documentation alone.
Pinned exact-head CI, protected serial integration and live revision remain pending.
