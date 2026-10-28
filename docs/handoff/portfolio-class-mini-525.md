# #525: overview class mini histories

Base: verified live main `3dcfcf2e2405e0040d718e058bd0574c9f20b749`.
Bounded source package only; parent #525 remains open.

## Source contract

`PortfolioPage` already reads `portfolioPerformanceQuery(period)`. The overview
now passes that response's `performanceHistory` to a compact sibling section.
The daily aggregate `PortfolioOverview` file stays unchanged, including its
value/TTWROR chart, inspection, benchmarks and exact deposit/withdrawal markers.
The sibling preserves the aggregate region's single-chart keyboard/test scope.

The new section keeps the reader's class universe and order, including sold,
unused and unclassified classes. Every mini uses the same `history.index` dates
and common index scale. Values are read by date from the existing class indexes;
no return, contribution or EUR attribution is recomputed. The monthly TTWROR,
base 100, start/month-end/final partial-month basis and dated classifications are
explicit. Nulls split lines and remain unavailable in captions/table; isolated
observations are points. There are no class flow markers or invented daily data.

ChartSvg/Line, the existing index-axis geometry, decimal formatter and width hook
are reused. A two-column desktop / one-column phone grid uses tokens and 96px
plots. The collapsed table exposes all dates and classes with exact displayed
index values. Keyboard chart inspection, a scrollable table, 44px disclosure and
privacy masking retain the normal shared UI primitives. No API/DB/domain,
financial formula, settings/write path or dependency changes.

## Checks and evidence

- New `portfolio-class-histories.test.tsx`: literal held index
  `[100,110,null,121,133.1]`, sold `[100,105,null,null,null]`, and empty
  unclassified class; two separate held line segments, source order, shared
  January–May dates, explicit gaps, immutable input, period-response replacement
  and hide/unhide restoration of known index values.
- Existing `e2e/issue-544-portfolio-registers.spec.ts`: only a type import and one
  additive test. All original acceptance cases, amounts, assertions and timeouts
  remain untouched. The new case compares two selected periods' complete source
  class/date/table values, pins four sample classes and May/August endpoints,
  checks unchanged daily marker counts/data, inspects a known class index by
  keyboard, toggles real privacy UI, checks table/tooltip/accessible attributes
  and exact restoration. It checks expanded-table Axe in light/dark, phone
  overflow/44px summary and saves scoped synthetic screenshots.
- Retain the existing #544 standard-fixture desktop height <=1800px, both-theme
  Axe, phone width and navigation assertions. Also run unchanged
  `portfolio-overview.spec.ts`, `wealth-ux-v1.spec.ts`,
  `issue-546-portfolio-metrics.spec.ts`, relevant #512 disclosure/visible-quality
  and shared chart tests. This checks daily markers/financial oracles independently
  from the new class table. No old tests or baselines were removed or weakened.

No local Node/npm/build/test/browser/install/lint/formatter was run under the
host RAM restriction. Independent full source review
`private/525-class-mini-final-review.md` and later scoped test reviews cleared
the immutable deltas. Focused 40615094999 exposed only a new WebKit test tooltip
locator ambiguity; focused 40615830773 passed the corrected new case in all
three profiles. Focused 40616926360 passed 3 literal units and all 6 selected
browser cases first attempt. All 48 caption text-range checks passed in their
actual viewports; clean phone viewport images show complete labels. The only
red result was formatting; the exact reviewed patch was applied. Required
public exact-head CI and verified delivery remain pending.

## Separate acceptance

The private one-time audited benchmark selection and PP gates #355/#356 are not
proved or changed. No physical-device result is claimed. Portfolio report
consolidation stays in #487. This package does not close #525 from its children.
