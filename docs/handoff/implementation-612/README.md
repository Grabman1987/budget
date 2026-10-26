# #612 local Sondertilgung scenario

The selected loan's #611 plan/history read pair remains the source of the current balance,
currency, dated rates and canonical API baseline. Monthly and one-off extras are parsed to integer
cents and applied only with `simulateLoan`; the result, scenario chart line and annual table use
the same returned schedule. No scenario save, booking or audit endpoint is called. The existing
saved scenario editor remains under Rechenweg.

The original V16 frame `206:9364` resolves the otherwise ambiguous example to 4,200 EUR
principal, 200 EUR monthly installment, 4% nominal APR, zero fees, first payment October 2026,
and 500 EUR one-off in November 2026. The independent BigInt cents oracle in private
`612-oracle-notes.mjs` gives baseline July 2028 / 22 payments / 161.57 EUR interest and scenario
May 2028 / 20 payments / 128.94 EUR interest. Savings are 32.63 EUR and two months. The repo
test uses these literal expected values; it does not derive its expectations from app output.

An edited draft survives a pending or failed replacement read, while all financial output is
hidden. An identical successful basis restores the draft. A changed loan/history read pair stays
hidden until the user explicitly adopts it, which resets the local fields. Invalid amounts or a
missing one-off month leave the baseline intact and show no scenario comparison. The chart
preserves the #611 actual-history gaps, native currency, exact tooltip values and privacy masking.

## Test file reasons

- `debt-plan-history.test.ts`: adds the literal V16 oracle and input-boundary cases; existing
  account/history consistency assertions retain their meanings.
- `debt-plan-chart.test.tsx`: proves a distinct scenario line and inspection values; existing
  actual-gap and privacy assertions are unchanged.
- `debt-plan-history-refresh.test.tsx`: adds the edited-draft pending/error/adoption regression and
  verifies a monthly extra uses the matching USD loan/plan basis and changes its payoff; the
  previous failed-refetch assertion remains unchanged. jsdom is used for stateful controls.
- `e2e/issue-612-debt-live.spec.ts`: creates only a synthetic loan, checks the visible V16 result,
  monthly response, no API writes, reload reset, 1440/390/WebKit light/dark Axe and overflow,
  touch sizes and privacy. Canonical browser execution and image inspection are recorded below.
- `e2e/loan-planning.spec.ts`: retains the saved-rate, duplicate-date, financial and Undo/Redo
  expectations and native save click. Added mobile guards reject document/dialog width outside
  the actual visual viewport and require the save button to own its center point before clicking.
  No timeout, retry, tolerance, skip or protected expectation was changed.

At the initial implementation `0133c2ac`, Node 22.23.3 web TypeScript, three focused Vitest files
(nine tests), scoped ESLint, Prettier, CSS scale and `git diff --check` passed. The label correction
`a5774010` passed the focused refresh suite (three tests, including USD), scoped ESLint, Prettier
and the diff check. Its repeated web TypeScript check aborted with a fatal Node out-of-memory
error; it was not retried. Full CI at `683efeac` subsequently passed static/typecheck and all
other groups except the existing mobile loan-planning flow described below. Required final-head
PR CI remains pending; these revision-specific results do not replace that gate.
The independent full financial/UI review found only the corrected currency label; independent
delta review accepted the code and requested this revision-specific evidence clarification.

## Canonical Linux browser evidence

- [40380389506](https://github.com/Grabman1987/budget/actions/runs/40380389506) checked out
  `a24891859e48f10b291a1297b408fc85536bf9eb`: nine passed in 38.2 seconds, with no failures,
  retries, skips or baseline changes. It selected the new #612 and existing #611 cases on desktop,
  Chromium mobile and WebKit iPhone, plus their setup dependencies. Both-theme images were inspected.
- Published Docker main `d859067b` was merged at `a9c49b8d` without conflicts. All eight feature
  file blobs stayed identical to the reviewed browser source; only the separately reviewed Docker
  pin update arrived from main.
- Visual review found that the phone table needed a discoverable sideways-scroll cue. Correction
  `460749e4` reuses the Reports hint stylesheet and labels the existing focusable scroll region.
  Its E2E addition moves that region to the right and proves the complete payment-column header is
  reachable, then restores its position. No financial or privacy assertion was removed or changed.
- [40381825656](https://github.com/Grabman1987/budget/actions/runs/40381825656) checked out
  `460749e42f458c817307ffe19068e71c8d78bfe6`: six passed in 27.1 seconds, with no failures,
  retries, skips or baseline changes. This follow-up selected only #612 and its setup dependencies;
  it covers the three configured profiles, both themes, native horizontal scrolling, Axe, phone
  target sizes, privacy and the unchanged no-write and literal V16 expectations. Updated images
  were inspected. These overlapping runs are separate checkpoints, not fifteen unique tests.
- Full PR run [40383277637](https://github.com/Grabman1987/budget/actions/runs/40383277637)
  at `683efeac` exposed a real phone overflow after Undo/Redo: the refreshed-basis action stayed
  on one line (417 pixels wide), widening the 390-pixel page to 433 pixels. The next dialog then
  used the widened layout viewport, and its native save click hit the hint instead. Measured
  phase geometry identified the action before the dialog opened; a footer paint hypothesis was
  ineffective and its CSS changes are absent from the final diff.
- Correction `349eafea` wraps only `.debt-live-refresh .btn` on phones, caps its width and keeps
  its height flexible with a 44-pixel minimum. Financial state, adoption and save behavior are
  unchanged. Temporary diagnostics were removed; the regression guards above remain.
- [40394229315](https://github.com/Grabman1987/budget/actions/runs/40394229315) checked out
  `349eafead8b36a7129cda515cb2396d5bf1b8459`: thirteen passed in 1.1 minutes, with no failures,
  retries, skips or baseline changes. It selected existing loan-planning, #611 and #612 with
  setup dependencies on their configured profiles, including the previously blocked mobile save.
  Updated scenario images were inspected. Node 22.23.3 scoped lint, formatting, CSS scale and
  diff checks also passed. This checkpoint overlaps the earlier scoped runs.

The full financial/source review and the currency-label, evidence-documentation and scroll-cue
delta reviews are clear, including independent inspection of the final overflow fix and test guards.
Exact-head required PR CI, including the current typecheck, and publication
remain pending; successful scoped browser workflows do not replace those gates.
