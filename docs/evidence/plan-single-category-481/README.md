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

Expanded-source typecheck/lint/build, native browser results, physical geometry,
independent review and exact-head CI are recorded as they complete. The current
expanded implementation is not accepted merely because an earlier feature
revision passed. Required desktop/mobile/WebKit, final evidence review, serial
integration and live verification remain open; #481 stays open.

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
