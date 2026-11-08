# Plan calm rows (#1006)

The redesign toolbar combines search, five counted filters, the month span, the
existing audited undo/redo callbacks, distribution and the options menu. The
options menu retains attention and uncategorized filters, grouping, category-group
creation and month close. Density is a browser preference under
`budget.plan.density`, following the existing month-span preference.
Active attention/uncategorized filters also appear as pressed, removable toolbar
chips. The toolbar history expires or is dismissed with its toast, clears on later
writes, and permits retry after a rejected undo without replacing newer feedback.
The merged group ordering, hidden-group rules, contact advances, announcements and
desktop month-close header link remain available.

Rows show plain progress fills only on hover, focus or selection. Compact uses
thin fills; Minimal intentionally hides progress bars entirely, including on hover,
focus and selection. Status text and amounts remain visible. Available amounts retain their signs and add an
icon without a border. Group headings use a thin separator. Financial writers,
calculations and account figures are unchanged.

All screenshots use disposable synthetic ledgers. Browser emulation is not
physical-device acceptance. The four retained evidence PNGs show 1440 light, 1440 dark, 390 light and one
undo state. They are review artifacts, not replacement baselines; any affected
visual baselines are regenerated only through the CI snapshot workflow.

## Test changes

| File | Reason |
| --- | --- |
| `plan-density.test.tsx` | Preference persistence, cross-tab changes, invalid storage and unavailable storage. |
| `plan-filters-589.test.ts` | Literal overfunded boundary against the resolved monthly goal, including excluded states. |
| `plan-redesign.test.tsx` | Counted filters, density without writes, and keyboard navigation through the updated options menu. |
| `toast.test.tsx` | Verify the optional dismissal callback on expiry, replacement, Escape and unmount. |
| `issue-1003-plan-tidy.spec.ts` | Preserve archive, group sorting, contact and money assertions while expecting the single calm toolbar. |
| `use-category-writes.test.tsx` | Toolbar expiry/dismissal/replacement, later no-op/error writes, retry after rejection and stale async rejection; existing conflict and refresh assertions remain. |
| `issue-1006-plan-calm-rows.spec.ts` | ON desktop/phone light/dark evidence, toolbar geometry, density persistence, multi-month icons, accessibility, bottom toast and real undo/redo. |
| `issue-471-icons.spec.ts` | Remove the scale exception for the removed filter disclosure icon. |
| `issue-587-plan-monat-kopf.spec.ts` | Reach distribution and month close through their retained menus. |
| `issue-588-plan-menus.spec.ts` | ON icon menu and toolbar month count; OFF keeps original controls. |
| `issue-589-plan-filters.spec.ts` | Primary filters are inline; uncategorized remains in options. |
| `issue-832-month-plan.spec.ts` | Measure and activate the distribution toolbar control instead of the removed duplicate lead button; scope the existing undo assertion to the toast now that toolbar undo is also available. |
| `issue-992-plan-calm-focus.spec.ts` | Check hover-only plain bars, including the neutral fill fallback, and the relocated attention filter and toolbar actions. |
| `month-nav.spec.ts` | ON month count uses the toolbar; OFF still uses options. |
| `plan-compact-grid.spec.ts` | Updated grouping/month-control locations and icon menu selector. |
| `plan.spec.ts` | Start the existing waterfall assistant through the distribution menu. |
| `issue-735-plan-activity.spec.ts` | Reach the ON month span in the toolbar while preserving activity month and return-state assertions. |
| `issue-981-plan-grid.spec.ts` | Assert the approved thin separators and state icons; retain exact geometry, overflow, keyboard and no-write checks. |
| `pace-marker.spec.ts` | Focus the category to reveal its progressive bar before checking the unchanged date marker. |
| `plan-inspector.spec.ts` | Use the month heading for outside-click deselection because toolbar actions now preserve selection. |

Independent review covered the complete implementation and test adaptations.
Financial assertions, timeouts and tolerances were retained.

## Verification

The fix passed 69 focused unit tests across eight files, typecheck, changed-file
ESLint and Prettier. Chromium at 1440 and 390 passed the calm-row cases including
expiry and removable filters (16 cases), and the merged sorting/archive/contact
cases (14 cases); each spec ran separately with one worker. ON and OFF builds are
checked separately. WebKit and complete regression acceptance remain with the
exact-head CI run. No timeout, financial oracle or tolerance was relaxed.

Geometry diagnosis: the first desktop probe reported five pixels of horizontal
overflow. Removing legacy scroll padding alone did not fix it. A computed DOM
measurement traced the overflow to the available-state icon plus pill/cell
padding on a longer synthetic negative amount. Compact token-based padding keeps
the existing 128px amount columns and zero-overflow assertion. The 768–1179px
inspector row reset also preserves the original single-column layout at that range.
The focused dark desktop geometry case then passed at both 1440 and 1280, including
zero overflow, exact amount tracks, keyboard actions and no-write assertions.
