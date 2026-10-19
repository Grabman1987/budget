# Plan group/category bands — #481

Owner decision 7A, extended on 2026-10-19, approves combining each expanded Groups-view parent with its first category. The current synthetic ledger comparison is **55 → 36 logical content rows, 34.55% fewer**, preserving all 36 categories and 19 group contexts. Physical height is reported separately; this does not claim 30% less physical height.

The compact band retains separate parent/category selection, labelled group totals and category figures, inspector, status/bar and creation controls. Parent aggregate contexts stay inert; native collapse/reopen preserves keyboard focus. Existing integer-cent calculations, APIs, write/rollback/undo callbacks and alternate/multiple-month views remain unchanged.

## Actual current verification

The frozen `b29a0a80962559be1018bb2434e5c57f2400bbfa` working tree, including the coordinator-owned old-test adaptations below, passed a fresh E2E build and **13/13 actual pinned WebKit 27.2 cases, exit 0, 2.8 minutes**. All 26 recorded source/test/document/image hashes remained unchanged. The temporary read-only geometry diagnostic was removed after its complete artifacts were archived. No test skipped coverage or raised its timeout.

The run comprised three unchanged setup cases, one exact-fixture three-profile geometry diagnostic, the sample/row-count/theme case, the financial/keyboard case, four desktop parent-contrast batches, two desktop geometry/capture cases and the existing compact-grid case. New parent batches still cover all eight distinct groups per theme. The sample retains its original 90-second budget; each desktop case retains its default 30 seconds.

Passed coverage includes literal cent writes/refusal/cover/move/undo, inline creation, group/category selection, transition to two categories, native collapse/focus restoration, inert parent aggregate clicks, long-name ellipsis/full accessible names, unclipped short parent names, every parent’s on-screen normal-ink/text-fill and actual opaque-background contrast ≥4.5, strict main/band Axe, native phone targets ≥44px and page overflow. The phone captures include the existing fixed navigation/FAB; target-size checks do not establish every unobscured hit point. Group totals remain distinct from the first category’s exact figures. The coordinator's existing compact-grid adaptation retains all original financial literals and actions.

The shared reduced-motion dependency disables the unintended universal positive-duration transitions using only `transition-duration:0s !important`; its real desktop/phone theme-control dark→light proof and independent four-image review are recorded in [the shared evidence](../reduced-motion-481-595/README.md). The failed app-root color candidate is absent. Current Plan captures now show correct ordinary ink on actual dark/light surfaces; past failed captures remain external history, not current acceptance.

## Measured geometry

These are full semantic role unions, including financial buttons/inputs/labels and the spending-bar tick. Every ordinary row still uses its physical row bound. The combined band has an additional physical cap; a content-role measurement does not waive a whole-band limit.

| Actual profile | Category union / cap | Parent union / cap | Whole combined band / cap |
| --- | --- | --- | --- |
| True desktop WebKit, 1440×900 | 39.140625 / 40px | 32 / 36px | 48.390625 / 76px |
| WebKit iPhone, 390×664 | ≤70.5 / 76px | 72.78125 / 76px | ≤150.78125 / 152px |
| Additional 390×844 comparison | ≤70.5 / 76px | 72.78125 / 76px | ≤150.78125 / 152px |

The exact desktop fixture has 92px before the grid (original cap 120px) and 17 category rows within the first viewport (original minimum 14). The original phone top-bar cap and multiple-month/keyboard/financial assertions remain intact.

The full sample table measures **1746.625px at 1440×900** and **3842.25px at 390×664**. These actual pixel heights are separate from the logical 34.55% row reduction. No physical-height percentage is inferred.

## Existing-test policy and per-file rationale

The coordinator alone applied these changes under the owner's 2026-10-17 UI-test policy and the explicit 2026-10-19 combined-head decision 7A. Independent Codex full-diff and geometry-policy reviews covered the complete changes under the owner’s 2026-10-19 model authorization [#694](https://github.com/Grabman1987/budget/issues/694). The implementing agent did not edit these existing tests. No skips, baseline replacement, looser financial oracle, increased timeout or tolerance waiver is included. See [queue test policy](../../queue/README.md) and [owner design decision](../../../DESIGN.md).

| Existing file | Decided UI adaptation | Coverage retained or strengthened |
| --- | --- | --- |
| `apps/web/src/budget/budget-ui.test.tsx` | Query the actual combined accessible category name `Alltag· Lebensmittel`. | All inspector/amount-edit/selection assertions after that lookup remain unchanged. |
| `e2e/plan-detail-pages.spec.ts` | Identify the same final fixture category explicitly as `Notgroschen`, checking `cat-notgroschen`, the category-name element and its accessible name. | The same inspector → history URL → browser-back/scroll behavior remains. |
| `e2e/issue-588-plan-menus.spec.ts` | Classify 8 multi-category bands, 11 single-category bands and 36 category rows; distinguish collapsed parent-only rows. | Collapse removes multi-category children, preserves visible singles and restores every child; menu keyboard and month-span assertions remain. |
| `e2e/plan-compact-grid.spec.ts` | Separate category selection from parent selection and group totals from first-category amounts; measure complete parent/category roles inside the shared band. | Original desktop 40px/36px, phone category 76px, before-grid 120px, visible-row minimum 14, targets/Axe/overflow/keyboard/month spans and every financial literal retained. Added exact role counts, parent states, first-category literals, parent-phone 76px and whole-band 76px/152px limits. |
| `e2e/plan.spec.ts` | Narrow available-value locator from `.col-avail` to category `.col-avail .pill`, excluding the newly co-located group total. | All cent literals, writes, cover/move and undo assertions unchanged. |
| `e2e/ux-distill.spec.ts` | Use category `.col-avail .pill`. | Exact funding/remaining-value literals, action order and behavior unchanged. |
| `e2e/ux-cover-limits.spec.ts` | Use category `.col-avail .pill` (one formatter-only line wrap). | All commitment protection, missing-money, credit and undo oracles unchanged. |
| `e2e/issue-588-plan-menus-undo.spec.ts` | Use category `.col-avail .pill` for before/after/undo values. | The named source, exact −50/100/0 EUR values, to-be-assigned amounts and undo restoration remain unchanged. |
| `e2e/month-nav.spec.ts` | Use category `.col-avail .pill` before/after cover/undo. | Selected-month routing/span, exact −50/0/−50 EUR and undo assertions unchanged. |

## Current actual artifacts

The author, coordinator and two independent reviewers opened all current light/dark desktop/phone images without a new actionable finding. [Runtime summary](runtime-current.json) records the actual profiles, measurements, image hashes and nine existing-test hashes. Only the following images form this current proof; other older files in this directory are historical.

| Profile | Light | Dark |
| --- | --- | --- |
| Actual WebKit desktop,1440×900 | [Image](webkit-desktop-light.png) | [Image](webkit-desktop-dark.png) |
| Actual WebKit phone,390×664 | [Image](webkit-iphone-light.png) | [Image](webkit-iphone-dark.png) |

## Remaining delivery gates

The age-required aggregate check passed **505 files /4491 tests, exit0**, unit duration381.57s, followed by a normal production build, exit0. Node22.23.3/age1.2.1, two Vitest workers and the shared full-check lock were used. All26 hashes, HEAD and coordinator-owned dirty state remained unchanged. Existing nonfatal `panel.tsx:208` unused-eslint-disable and JSDOM `scrollTo()` notices are retained in the logs. These checks describe the frozen b29 working tree (historical main f3aafd78 plus common5be538 and the named coordinator patches), not a later main refresh. Required exact-head Chromium desktop/mobile CI, affected existing-caller compatibility, coordinator review label, serial integration and deployed/live verification remain open. Actual WebKit desktop contexts are correctly labelled WebKit and do not substitute for Chromium. No merge, deployment, completed acceptance or issue closure is claimed here.
