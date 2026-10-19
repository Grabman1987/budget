# Plan group/category bands — #481

Owner decision 7A, extended on 2026-10-19, approves combining each expanded Groups-view parent with its first category. The current synthetic ledger comparison is **55 → 36 logical content rows, 34.55% fewer**, preserving all 36 categories and 19 group contexts. Physical height is reported separately; this does not claim 30% less physical height.

The compact band retains separate parent/category selection, labelled group totals and category figures, inspector, status/bar and creation controls. Parent aggregate contexts stay inert; native collapse/reopen preserves keyboard focus. Existing integer-cent calculations, APIs, write/rollback/undo callbacks and alternate/multiple-month views remain unchanged.

## Actual current verification

Frozen runtime source `218679c8dfefe1438fbf58039f852fa1366b70b2` passed a fresh E2E build and **15/15 actual pinned WebKit 27.2 cases, exit 0, 3.0 minutes**. All 29 recorded source/test/document/image hashes, HEAD and clean status remained unchanged. The temporary read-only geometry diagnostic was removed only after its complete artifacts were archived. No test skipped coverage or raised its timeout.

The run comprised three unchanged setup cases, one exact-fixture three-profile geometry diagnostic with fourteen supplementary width/theme profiles, the sample/row-count/theme case, the financial/keyboard case, four desktop parent-contrast batches, two desktop geometry/capture cases, two permanently retained narrow-desktop regressions and the existing compact-grid case. The new narrow cases retain light/dark coverage at 768/1180/1439 pixels, positive parent/category/status bounds, unchanged 40/36/76px caps, strict page width and real scrolling/focus of the existing last-column controls. Parent batches still cover all eight distinct groups per theme. The sample retains its original 90-second budget; each desktop case retains its default 30 seconds.

Passed coverage includes literal cent writes/refusal/cover/move/undo, inline creation, group/category selection, transition to two categories, native collapse/focus restoration, inert parent aggregate clicks, long-name ellipsis/full accessible names, unclipped short parent names, every parent’s on-screen normal ink and actual opaque-background contrast ≥4.5, strict main/band Axe, native phone targets ≥44px and page overflow. The phone captures include the existing fixed navigation/FAB; target-size checks do not establish every unobscured hit point. Group totals remain distinct from the first category’s exact figures. The coordinator's existing compact-grid adaptation retains all original financial literals and actions.

The shared reduced-motion dependency disables the unintended universal positive-duration transitions using only `transition-duration:0s !important`; its real desktop/phone theme-control dark→light proof and independent four-image review are recorded in [the shared evidence](../reduced-motion-481-595/README.md). The failed app-root color candidate is absent. Current Plan captures now show correct ordinary ink on actual dark/light surfaces; past failed captures remain external history, not current acceptance.

At widths 768–1439, the existing parent/category name cell uses two compact lines instead of starving either label; 1440px and phone layouts retain their separate established rules. A genuine existing `pmulti-scroll` wrapper contains the single-month table, preserving intact financial figures and right-edge controls. Its positioned containing block also anchors the absolute screen-reader labels. Previous frozen candidates that produced 812–874px page widths at a 768px viewport remain failed external evidence; their results are not accepted. At the current source, every tested width 768/1024/1180/1200/1400/1439/1440 in both themes has document width exactly equal to its viewport. All 55 absolute table labels resolve their offset parent to the scroller. The authoritative checks are actual page width, complete role bounds and genuine right-edge reachability, rather than an approximate clipping classifier.

## Measured geometry

These are full semantic role unions, including financial buttons/inputs/labels and the spending-bar tick. Every ordinary row still uses its physical row bound. The combined band has an additional physical cap; a content-role measurement does not waive a whole-band limit.

| Actual profile | Category union / cap | Parent union / cap | Whole combined band / cap |
| --- | --- | --- | --- |
| True desktop WebKit, 1440×900 | 39.140625 / 40px | 32 / 36px | 48.390625 / 76px |
| True desktop WebKit, 768/1024/1180/1200/1400/1439×900, both themes | ≤39.6875 / 40px | 28 / 36px | 64 / 76px |
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

The final clean normal-main merge `908e090c2a2789781ab81d0436addfebdece05ca`, including verified live main `bf11eebd1b14bbadbd5186be98fab3a0316c632e`, passed **BUDGET_REQUIRE_AGE=1 npm run check: 519 files / 4573 tests, exit 0**, Vitest duration 390.34s, followed by **normal npm run build, exit 0**. Node 22.23.3 / age 1.2.1, two Vitest workers and the same exclusive full-check lock were used. All 29 frozen hashes plus all 3337 tracked-file hashes, HEAD and clean status remained unchanged. Existing nonfatal `panel.tsx:208` unused-eslint-disable and JSDOM `scrollTo()` notices remain in the preserved logs.

The native proof and images above were actually produced at `218679c8`, before the two normal live-main merges. All 28 non-Roadmap feature/test/evidence paths—including both product files, the new regression and all nine protected tests—remained byte-identical through the final merge; all incoming unowned main blobs/modes were independently checked. The Roadmap is the complete incoming file plus the verbatim own status block. This qualifies the evidence rather than claiming an unperformed merged-head browser run. These final result-document/image updates follow the passing aggregate.

Required exact-head Chromium desktop/mobile CI, affected existing-caller compatibility, coordinator review label, serial integration and deployed/live verification remain open. Actual WebKit desktop contexts are correctly labelled WebKit and do not substitute for Chromium. No merge, deployment, completed acceptance or issue closure is claimed here.
