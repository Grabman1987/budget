# Plan calm rows (#1006)

The redesign toolbar combines search, five counted filters, the month span, the
existing audited undo/redo callbacks, distribution and the options menu. The
options menu retains attention and uncategorized filters, grouping, category-group
creation and month close. Density is a browser preference under
`budget.plan.density`, following the existing month-span preference.

Rows show plain progress fills only on hover, focus or selection. Compact uses
thin fills; Minimal omits them. Available amounts retain their signs and add an
icon without a border. Group headings use a thin separator. Financial writers,
calculations and account figures are unchanged.

All screenshots use disposable synthetic ledgers. Browser emulation is not
physical-device acceptance. No existing Plan screenshot baseline assertions were
affected; the evidence PNGs are review artifacts, not replacement baselines.

## Test changes

| File | Reason |
| --- | --- |
| `plan-density.test.tsx` | Preference persistence, cross-tab changes, invalid storage and unavailable storage. |
| `plan-filters-589.test.ts` | Literal overfunded boundary against the resolved monthly goal, including excluded states. |
| `plan-redesign.test.tsx` | Counted filters, density without writes, and keyboard navigation through the updated options menu. |
| `use-category-writes.test.tsx` | Toolbar and toast share the audited undo/redo action; existing conflict and refresh assertions remain. |
| `issue-1006-plan-calm-rows.spec.ts` | ON desktop/phone light/dark evidence, toolbar geometry, density persistence, multi-month icons, accessibility, bottom toast and real undo/redo. |
| `issue-471-icons.spec.ts` | Remove the scale exception for the removed filter disclosure icon. |
| `issue-587-plan-monat-kopf.spec.ts` | Reach distribution and month close through their retained menus. |
| `issue-588-plan-menus.spec.ts` | ON icon menu and toolbar month count; OFF keeps original controls. |
| `issue-589-plan-filters.spec.ts` | Primary filters are inline; uncategorized remains in options. |
| `issue-832-month-plan.spec.ts` | Measure and activate the distribution toolbar control instead of the removed duplicate lead button. |
| `issue-992-plan-calm-focus.spec.ts` | Check hover-only plain bars and the relocated attention filter and toolbar actions. |
| `month-nav.spec.ts` | ON month count uses the toolbar; OFF still uses options. |
| `plan-compact-grid.spec.ts` | Updated grouping/month-control locations and icon menu selector. |
| `plan.spec.ts` | Start the existing waterfall assistant through the distribution menu. |

Independent review covered the complete implementation and test adaptations.
Financial assertions, timeouts and tolerances were retained.

## Local verification limits

Chromium at 1440 and 390 passed the light/dark presentation, density and real
undo/redo checks, including toast-action containment. The additional Windows
WebKit run reached the existing 30-second limit during Axe/full-page screenshot
work or reload/menu sequences. Traces did not show a financial assertion
mismatch. Presentation and history now have separate focused cases; no timeout
was increased. WebKit acceptance remains with the exact-head CI run.
