# Freiheit: dated actual investment history (#616)

Status: implementation candidate, not accepted or live. Stacked on the immutable
#615 candidate `1f8fad2aa2c7a5471d731484d2d19753db8c31be`; that parent was unmerged
when this worktree was created. Target-year persistence (#617) is outside this change.

## Read contract

The existing authenticated `/api/wealth/freedom` read adds `investedHistory` in the
same SQLite read transaction as its existing current figures. Web clients treat
the additional field as optional for existing responses/fixtures. No source data,
financial formula, R16 rule, selection write, ledger lock, audit or undo path changes.

Each completed calendar month since October 2023 is evaluated by #615's unchanged
`freedomInvestmentBasis` using the **current** Anlagebasis selection retrospectively,
as required by [the parent decision](https://github.com/Grabman1987/budget/issues/528#issuecomment-6213592200).
Expense months are not investment history. The current date is returned separately
with the exact current resolver value; a partial month is never labelled month-end.
Coincident current/month-end dates are deduplicated only for presentation.

Availability is a separate read wrapper: before the earliest selected account's
recorded opening, month-end history is null. For an empty selected universe, the
earliest persisted ledger account opening defines coverage, including retained
soft-deleted metadata; these rows do not enter the selected sum. Without any
recorded account there is no historical coverage. After coverage the canonical
resolver's explicit zero remains zero. This does not change the domain's existing
pre-opening zero or invent a missing valuation. The exact current API anchor is
preserved even when a chart cannot establish coverage for plotting it.

Missing selected prices, FX or unsafe sums remain dated nulls. Drawing splits at
every null, retains isolated known points, and adds no trend fit or intermediate
valuation samples. Full dates and unavailable rows remain inspectable with arrow
keys and in the historical table. The separately labelled current anchor and future
samples use actual calendar-day positions on the same axis.

The dashed forecast remains the existing shared monthly projector, with its exact
final partial year, possible target overshoot and finite 60-year horizon. Future
forecast endpoints are projected values, not actual future resolver valuations.
The #618 forecast table switch retains exactly those original forecast samples.
Historical values remain visible when the current valuation or forecast becomes
unavailable, including after the forecast-table switch had been selected.

## Synthetic financial evidence

The new repository tests use literal expected cents: November 30 = 10,000;
December 31 = null (missing quote); January 31 = null (missing FX);
leap-February 29 = 35,000; separate March 15 current anchor = 35,000.
October 31, before the selected November opening, stays null. Current selection
changes and existing grouped undo restore all dated values without rewriting money.
Additional cases retain valid old values when current FX is unavailable, distinguish
an explicitly empty selected universe from no recorded ledger, and reject an unsafe
sum instead of rounding it.

The model tests independently expect a 10,000-cent current value plus 3,000 monthly
at zero return to produce 46,000 after twelve months and a final 52,000 after fourteen,
preserving the 50,000 target overshoot. An unreachable zero-saving, zero-return
forecast ends after 720 months without claiming a reached goal.

## Verification and remaining gates

- Focused `vitest run freedom --maxWorkers=2`: 14 files / 62 tests passed before the final goal guard, including
  all existing Freiheit page/chart tests and the #615 scope-save/undo API regressions.
- The final set includes the empty-universe coverage refinement and a page-level
  regression retaining known history when the current source valuation is unavailable.
- DB, web and server typechecks; focused ESLint, Prettier and `git diff --check` passed.
- `npm run build:e2e` and `npm run build` passed. The final native selection includes
  two new #616 cases, all four original #618 cases and three unchanged canonical setup tests.
  Browser configuration and all original assertions/timeouts remain unchanged.
- Independent financial/source whole-diff review cleared the frozen twelve-file
  source/test manifest. Its separate worktree passed four files / eleven targeted
  tests plus an independent real-dated booking/scope/undo/read-only probe with
  literal 10,500 → 9,125 → 11,125 historical cents and a 16,000 current anchor.
  Subsequent source/test and screenshot deltas were also independently reviewed.
  The final updates below only record executed aggregate/browser results.
- Final real WebKit 27.2 execution passed all nine selected tests: three unchanged
  setup cases, two new #616 scenarios and all four original #618 cases with the
  coordinator's keyboard advancement. There were no skipped, flaky or unexpected tests.
  The canonical iPhone context is width 390 / coarse pointer / DPR 3. The separately
  created desktop context explicitly asserts width 1440 / fine pointer / no touch /
  DPR 1. Both pass light/dark Axe, page overflow, 44px controls, literal dated values,
  null-gap inspection, forecast-table samples, arrow keys, Escape and amount privacy.
  The desktop case proves actual Linux WebKit layout, not Chromium or Windows acceptance.
- Touch is proved by a native touchscreen tap and the observed
  `pointerdown.pointerType === 'touch'`. This WebKit runtime reports
  `navigator.maxTouchPoints === 0` even under the configured touch profile. Earlier
  runs selected the hover branch from that unreliable property and are explicitly
  **not** touch evidence. Only the final corrected run supports the touch assertion.
- Final screenshots reset inspector focus and assert actual scroll position zero
  before capture, preventing WebKit's earlier sticky-chrome scroll-offset artifact.
  The ordinary fixed phone navigation appears once at the visible viewport edge in
  the full-page capture. All four final PNGs were opened by the implementer and
  independent reviewer. Their bytes remain identical in the final nine-case capture;
  the subsequently added goal guard was independently reviewed as described below.
- A new literal net-refund regression reproduced an invalid negative goal line
  below the historical plot before the fix (one failed / three passed). The
  coordinator authorized a one-line presentation guard: only positive targets
  pass into the chart. The original target figure, explanation and all formulas
  remain unchanged. New negative and zero cases both retain the actual history
  and its reason while omitting the invalid goal; the new RTL file passed five tests.
  The narrow source/test change was independently reviewed and its hashes reverified.
- Final `BUDGET_REQUIRE_AGE=1 npm run check` passed **491 files / 4,415 tests** with
  two workers, including all workspace type/lint/CSS/format checks and the final
  goal regressions. The production build passed. All twenty frozen files were
  verified identical before/after the aggregate; only evidence/results change afterward.
- Desktop Chromium 1440, Chromium mobile 390, exact-head CI/Windows, parent integration
  and serial deployment/live-revision gates remain unverified here.
- The orchestrator applied exactly seven lines to existing
  `e2e/issue-618-freedom-info-switch.spec.ts`: advance past historical month ends
  strictly before today, then retain its entire original forecast-value loop,
  ArrowRight/Escape actions, assertions and timeouts byte-for-byte. Independent
  inverse comparison verified the original file SHA256
  `8e657beaddd9d7da3b8148523c1d52c6066f4737b9d1dc5eaefc81b5c1d363d4`.
  All four adapted original cases passed in the final nine-test native execution.
  No existing test was edited by the implementer; the coordinator owns this UI
  policy adaptation, its per-file justification and PR approval label.

Actual final captures and runtime metadata:

- [WebKit desktop 1440 light](616/freedom-history-webkit-iphone-desktop1440-light.png)
- [WebKit desktop 1440 dark](616/freedom-history-webkit-iphone-desktop1440-dark.png)
- [Canonical iPhone 390 light](616/freedom-history-webkit-iphone-light.png)
- [Canonical iPhone 390 dark](616/freedom-history-webkit-iphone-dark.png)
- [Final runtime and results](616/runtime-results.json)

Profiles used: verified delivery, Ponytail, Impeccable and Diagram Design. The pinned
Diagram Design source/line reference was read; Budget tokens, existing ChartSvg and
the approved product contract take precedence over generic sample skins. No local
Impeccable engine was available; no engine detector result is claimed. The actual
prototype and desktop reference image were inspected. No existing tests were changed
by the implementer. No baselines, manifests or repository rules were changed.
