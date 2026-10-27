# #471 — icon consistency handoff

## Change

Normalize direct Lucide icons to the approved 16/20/24 px sizes and strokes, replace visual Unicode controls, add B/W/Z labels to 12 px class swatches, and show booking status beside its icon. Keep capture's existing `aria-pressed`, cash lock, click handler and save path. Preserve native disclosure behavior; shared CSS supplies the disclosure chevron only where an explicit chevron SVG is not already rendered. The custom mobile avatar remains markerless with its initials and native menu behavior.

Two visual defects found during review are resolved: the capture label and icon now fit inside the 44 px status target, and the mobile avatar no longer receives the generic disclosure caret. The capture layout fix lets the account-row track fit its content. The CSS exclusion is specific to the custom avatar; it does not suppress explicit SVG chevrons.

The final icon inventory covers direct Lucide callers under `apps/web/src` and `packages/ui/src`. Chart strokes at 2 and 0.5 represent plotted data geometry and remain unchanged. `DESIGN.md` records the approved 16/20/24 px rule.

## Test adaptations

These are technical presentation updates. They retain their original financial and interaction expectations:

| File | Reason and retained coverage |
| --- | --- |
| `apps/web/src/budget/plan-menus.test.tsx` | Remove the triangle from accessible menu text; keep menu actions, selection and focus assertions. |
| `apps/web/src/ledger/capture-form.test.tsx` | Update the split-button accessible name and assert the visible booking status; keep status and saved-booking expectations. |
| `apps/web/src/ledger/split-editor.test.tsx` | Update the split-button accessible name; retain allocation expectations. |
| `apps/web/src/month-close/stepper.test.tsx` | Locate the unchanged empty-state text without its decorative glyph; retain step behavior. |
| `apps/web/src/month-close/month-close-page.test.tsx` | Locate the unchanged empty-state text without its decorative glyph; retain close behavior. |
| `e2e/capture.spec.ts` | Expect the visible confirmation label; retain pending/confirmed writes and edit assertions. |
| `e2e/issue-471-icons.spec.ts` | Cover rendered icon scale, class labels, disclosure states, capture-label containment and the custom mobile avatar while retaining existing interaction and accessibility checks. |
| `e2e/report-tables.spec.ts` | Locate the year row by its accessible header name and the category label by its own span because decorative B/W/Z spans alter DOM text. Keep every financial total, average, share, and comparison oracle. CI run `40422683801` failed these selectors on desktop and mobile. |
| `e2e/issue-583-capture-two-column.spec.ts` | Expect the now markerless `Mehr` summary text. Keep its accessible name, open/closed state, and field behavior checks. CI run `40422683801` failed the old glyph expectation on mobile. |
| `e2e/year-report.spec.ts` | Preserve the exact two-page/no-clipping assertion and append bounded sheet-two child and table-row heights to its failure message. The same CI run measured 1104 px scroll height against 1068 px available, twice. This records where the print content grows; it does not claim the print layout is fixed. |
| `e2e/booking-acceptance.spec.ts` | Match the `Teilen` button's accessible name after its chevron became decorative; retain the focus and booking assertions. |
| `e2e/capture-dialog-layout.spec.ts` | Match that same button name in its bounds and click checks; retain layout, split, and action assertions. |
| `e2e/issue-734-category-picker.spec.ts` | Match that same button name before opening split categories; retain the picker and booking assertions. |
| `e2e/issue-624-explorer-persistence.spec.ts` | Expect the approved 16 px saved-view Bookmark instead of its former 13 px size; retain the 40-character name, controls-inside-card, and layout assertions. CI run `40422683801` measured the intended 16 px icon. |
| `e2e/category-trend.spec.ts` | Select the category by checkbox role and exact accessible name. The full CI accessibility snapshot shows a checked checkbox named `Strom` plus an aria-hidden `B` sibling inside its label; `getByLabel` matched DOM label text and missed it. Keep the original check/uncheck waits and all finance/drilldown expectations. |
| `e2e/issue-741-payroll-automation.spec.ts` | Keep all link visibility, click, and 44 px hit-target bounds; append scroll ancestor geometry when the link lies below the viewport. The full CI measured its bottom at 1078 px against a viewport of 844 px. The cause is not yet established. |

No financial oracle, write semantics, timeout or tolerance was changed.

CI shards 3, 6, and 8 of run `40422683801` also reached old `Teilen ▾` browser selectors after the shared split button replaced its text chevron with an aria-hidden SVG. The affected selectors above and in `e2e/issue-583-capture-two-column.spec.ts` now use the actual accessible name. No booking or split expectation changed.

The scoped print diagnostic on exact source `10a96f99` measured sheet 2 at 1087 px scroll height against 1068 px available. Its footer ended 20 px below the available body, while sheet 1 fit. Sheet 2 contains twenty swatch table rows (ten categories and ten heat rows), nearly all 18 px high. The icon branch changed `.sw` from 10 px inline-block to 12 px inline-flex; the compact print rows retain 1 px vertical padding and 1.15 line height. A one-pixel line-box rise per swatch row accounts for the measured overflow. A print-only vertical alignment now aims to contain the approved 12 px symbol in the row line box while keeping the B/W/Z text visible. This is a measured hypothesis pending the final exact-head print assertion; no page size, row data, or clipping tolerance changed. No local browser run was started on the memory-constrained host.

## Verification

- Canonical combined workflow [40419576242](https://github.com/Grabman1987/budget/actions/runs/40419576242) ran against exact source `473452bc6a89e1b3cef7a7af8ffb46377c65b171`. It passed 35 tests in 57.5 seconds, with no failures, retries or skips. The selected set comprised the two new issue-471 icon/capture cases, the existing capture case and screenshot cases from six affected specs. The explicit title filter did **not** execute all six new Plan/year/portfolio theme cases in `e2e/issue-471-icons.spec.ts`; complete PR CI remains required.
- At the `473452bc` checkpoint, application/UI source and tests matched independently reviewed `69275275` after merging main `c436e36`. Subsequent selector adaptations, failure diagnostics and the print-only alignment correction are recorded above and have separate independent review; they await final CI.
- First full PR CI [40422683801](https://github.com/Grabman1987/budget/actions/runs/40422683801), on `e3bfe983`, completed with the selector and layout failures described above. Static, Linux/Windows units, visual, Docker and restore jobs passed. Scoped diagnostic [40426062447](https://github.com/Grabman1987/budget/actions/runs/40426062447) checked out `10a96f99`: three failed, five passed and one skipped in 4.4 minutes. The two payroll profiles passed; print still overflowed, and the category diagnostic ran after its test timeout. The original full-CI accessibility snapshot subsequently established the correct checkbox name without another browser run.
- Earlier five-file unit evidence totals 30 tests, and a later Plan-menu rerun totals 9; later notes also record 17 focused ledger-symbol/capture-form tests. These are historical, overlapping checkpoints from earlier revisions, not additive unique totals or current exact-source proof.
- Capture screenshots in [the synthetic evidence note](../../evidence/icons-471/README.md) were captured from source `85adcf80` in workflow [40412320374](https://github.com/Grabman1987/budget/actions/runs/40412320374): 11 selected tests passed in 42.1 seconds. They support the corrected capture layout because the relevant capture source remained unchanged; they do not establish a physical iPhone result.

## Baseline review and remaining delivery gates

Independent review of baseline bot output `1b03d2f20dae9f00a9fb43d45e1d28e5696cf25a` inspected all ten PNG pairs across four snapshot specs. It initially held the Goals mobile count change from 1 to 9; the diagnostic below resolved this discrepancy. Both actual main and candidate show 9 in light and dark, with unchanged goal figures. All ten candidate baselines are accepted. The earlier proof branch `92a793e2` was rejected for adding a caret before the mobile avatar and is not acceptable evidence.

The first main diagnostic [40421266230](https://github.com/Grabman1987/budget/actions/runs/40421266230) and candidate diagnostic [40421661815](https://github.com/Grabman1987/budget/actions/runs/40421661815) each passed seven tests without updating baselines. Their existing 1% pixel tolerance makes those results insufficient to establish the actual counter. A forced capture of the same Goals cases on unchanged main `c436e36`, workflow [40421945040](https://github.com/Grabman1987/budget/actions/runs/40421945040), passed seven tests in 23.8 seconds and produced diagnostic-only commit `56271d65`. Independent comparison confirmed that its actual main captures also show 9, establishing that this count is not introduced by the icon change. No matcher tolerance or financial assertion was changed. These diagnostic main PNGs are not part of this change. Complete required exact-head PR CI, integration and publication remain outstanding.

The earlier capture clipping and mobile avatar findings are resolved in the current source and included in the canonical combined run. The custom avatar is explicitly markerless; native open/close behavior remains tested. This handoff records no physical-device result and does not claim all new theme/page cases ran.

## Shared delivery batch

Following the owner's 2026-10-27 request to reduce PR and repeated-check overhead, PR #785 also includes the separately reviewed [bank suggestion work](../implementation-562/README.md) and [manual acceptance-runner cleanup](../ci-manual-acceptance-677/README.md). Their source files were disjoint at integration; the reviewed bank files and CI cleanup were preserved exactly. The combined final head requires the four unchanged canonical CI checks before serial integration and publication. No separate bank-feature PR or automatic five-repeat acceptance run is needed for this batch.
