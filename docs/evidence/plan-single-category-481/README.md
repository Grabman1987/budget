# Plan group/category bands — #481

Scope: presentation in Plan › Monat, single-month Groups view. The starting
feature head is `4f24ed21`; current-main comparison is `e14932de`.

Owner decisions relayed by the coordinator on 2026-10-19 explicitly require
comparison against the **current 55 content rows**, rather than the historical
74-row audit. The original 11 single-category bands produce 44 rows and fail
that 30% criterion. The owner approved combining the other expanded group heads
with their first category too, targeting **36 / 55 rows, a 34.55% reduction**.
Collapse, selection, creation controls and every category must remain available.
Independent Codex whole-diff reviews and serial gated integration are authorized;
this implementer does not merge, deploy, close issues or start queue loops.

## Shared band behavior

- Existing single-category bands retain their category selection, inspector,
  status/bar, assignment, available pill and creation control.
- Expanded groups with several categories share a compact band with their first
  category. Desktop places the parent controls and category name/status beside
  each other. Group totals are explicitly labelled **Gruppe** above the first
  category's own values. Phone layout labels all three parent totals separately
  and retains distinct 44px parent/category controls.
- The group checkbox selects every category; the category checkbox selects just
  its category. Parent checkbox/button names explicitly identify the group,
  including when group and first-category names happen to be identical.
- Collapsing a multiple-category group retains its original parent-only summary
  and hides every category; reopening retains selection. Native group controls
  retain keyboard focus through both transitions, so consecutive Space/Enter
  activations continue to work. Group totals and parent whitespace remain inert;
  category controls retain their inspector behavior. The existing collapse
  exception for a single-category band remains unchanged.
- All amounts reuse existing `groupStatus`, `EnvelopeRow`, `AssignCell`, inspector
  and mutation callbacks. No financial formula, API or persisted data changes.
  Non-Groups and multiple-month layouts retain their existing structures.

## Measurements and checks

The new browser regression counts **all** 36 visible categories and all 19
combined expanded groups. Its acceptance assertion uses 55 → 36 directly;
there is no historical-audit substitute. Generated JSON additionally records
browser version, viewport and actual table height in pixels. Logical row
reduction does **not** imply a 30% physical-height reduction; actual pixel
measurements and captures must be reviewed separately.

The synthetic interaction case retains keyboard/creation shortcuts, cent-exact
writes, refusal guards, cover and undo. It additionally exercises the transition
from one to two categories, deliberately different group/category amounts,
parent selection, collapse and reopening. Group assigned/activity/available
figures of 100.30 / −100.09 / 0.21 euros are distinct from the first category's
100.01 assigned / −0.01 available euros; tests compare their proper contexts.
Both themes still require Axe, no page overflow and phone touch geometry.

At source `151a4ca6c26b52ec2854b2e18cfb1e6fe0670710`, standalone web typecheck,
scoped ESLint, formatting, CSS scale and diff checks passed; the existing budget
UI file passed 18/18 tests. Independent whole-diff review includes all ten changed
source/test/doc files, the coordinator's existing-test adaptations and decision
text. Its separate exact-head E2E build and budget UI run (18/18) passed.

The final independent genuine WebKit run at source `f922dfba` passed **14/14**
cases: three normal setup cases, seven canonical #481/#588 cases (including the
new true desktop geometry regression), three external review regressions and
one current desktop capture.
Both themes passed Axe, no page overflow and the unchanged 44px phone target
checks. Literal cent writes/refusal/undo/cover/move, creation shortcuts,
one-to-two-category transition, distinct parent/category values, parent/category
selection, collapse/reopen and consecutive native Space/Enter focus passed.
Group totals and parent context remained inert; category inspection still worked.

The refreshed committed `webkit-iphone-rows.json` and dark PNG were generated
by that final independent run at **390 × 664, WebKit 27.2**. Actual table height was
**3858.25 px**, separately from the **34.55% logical-row reduction**; no 30%
physical-height claim is made. The implementer, independent reviewer and
coordinator inspected the actual dark capture with no new actionable finding.
Existing desktop/mobile PNGs and JSON still describe the historical 44-row
version and must not be used as evidence for this expanded source.

The age-required full aggregate at evidence head `c7eb3f88` passed **481 files /
4382 tests**, plus all workspace type/lint/format checks; production build passed.
Image review of the first actual 1440 px desktop capture then found long parent
labels painting over adjacent controls: Versicherungen extended 1.92 px into the
category checkbox and overlapped the add control. A bounded parent-title
ellipsis/clip guard now confines that text to its own button while preserving
the full accessible group name. The new true desktop context regression measures
label/toggle/add/checkbox rectangles and clipped text paint extents at 1440 px.
It passed in the final 14-case run alongside all retained financial/action tests.

The current `webkit-desktop-light.png` and `webkit-desktop-rows.json` come from
the same final source: genuine Desktop Safari diagnostic, WebKit 27.2,
1440 × 900, isMobile false, hasTouch false, observed touch points 0 and coarse
pointer false. Fonts were loaded, Axe/no-overflow passed, and actual table height
was **1844.71875 px**, separately from 34.55% logical-row reduction. This is not
canonical Chromium acceptance. Implementer, reviewer and coordinator opened the
fresh desktop and phone captures; the parent text no longer overlaps controls.

At final evidence head `4e4bdf12` (product/test source still `f922dfba`),
`BUDGET_REQUIRE_AGE=1 npm run check` passed all workspace type/lint/format checks
and **481 files / 4382 tests**; the following production build passed. Both exited
0 under the shared full-check lock with two test workers.

A broader unchanged canonical compatibility run then exposed an additional open
gate: `e2e/plan-compact-grid.spec.ts:79` expects 18 checked inputs inside `.prow`,
but now finds 20 because two parent-group checkboxes share those category rows.
Its three standard setup cases passed; the actual scenario failed at that first
assertion. No existing test, timeout, bound or coverage was changed. The later
existing group-name, whole-cell-total and per-row-height assumptions are static
compatibility concerns and were not reached in that run. They require
coordinator-owned equivalent checks under the documented decision; height limits
must not simply be raised. This scenario and exact-head canonical Chromium
CI remain open despite the successful 14-case source-focused native run. The earlier feature's green CI does
not accept this expanded source. Final integration and live verification remain
required; #481 stays open.

## Historical verification of the earlier 44-row version

The coordinator preserved and independently reviewed the obsolete inspector
selector, collapse/menu and decorative-number detail-selector adaptations.
Those existing-main test changes remain in the branch; this implementer has not
modified them. Canonical CI
[39240826745](https://github.com/Grabman1987/budget/actions/runs/39240826745)
passed at `d309fa89`, including all canonical browser shards and other required
checks. The coordinator separately ran the real project WebKit/iPhone cases:
9/9 passed at the corrected earlier source. Those are historical results for
the 44-row version, not acceptance of this expanded source.

The managed Ubuntu container supplies the genuine pinned WebKit runtime using
the unchanged Playwright configuration. Direct host Chromium downloads remain
blocked by the enforced CDN redirect policy; canonical Chromium acceptance
comes from GitHub CI. No system browser replaces another required engine.

## Reproduction

```sh
npm run build:e2e
npx playwright test e2e/issue-481-single-category-band.spec.ts e2e/issue-588-plan-menus.spec.ts --project=desktop --project=mobile --project=webkit-iphone --workers=1
```

The normal API-only setup uses synthetic disposable databases. No real financial
data, production access or secrets are used. Existing-main test adaptations in this branch were made and authorized by the
coordinator, including the explicit 36-row collapse/reopen expectations in
issue-588-plan-menus.spec.ts. This implementer only iterated the new #481
regression. No tolerance, baseline, configuration or manifest was weakened.
