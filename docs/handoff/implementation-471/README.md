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

No financial oracle, write semantics, timeout or tolerance was changed.

## Verification

- Canonical combined workflow [40419576242](https://github.com/Grabman1987/budget/actions/runs/40419576242) ran against exact source `473452bc6a89e1b3cef7a7af8ffb46377c65b171`. It passed 35 tests in 57.5 seconds, with no failures, retries or skips. The selected set comprised the two new issue-471 icon/capture cases, the existing capture case and screenshot cases from six affected specs. The explicit title filter did **not** execute all six new Plan/year/portfolio theme cases in `e2e/issue-471-icons.spec.ts`; complete PR CI remains required.
- Application/UI source and tests are unchanged from independently reviewed `69275275` after merging main `c436e36`. Later differences are handoff documentation and reviewed baselines. Source equivalence does not constitute new test execution.
- Earlier five-file unit evidence totals 30 tests, and a later Plan-menu rerun totals 9; later notes also record 17 focused ledger-symbol/capture-form tests. These are historical, overlapping checkpoints from earlier revisions, not additive unique totals or current exact-source proof.
- Capture screenshots in [the synthetic evidence note](../../evidence/icons-471/README.md) were captured from source `85adcf80` in workflow [40412320374](https://github.com/Grabman1987/budget/actions/runs/40412320374): 11 selected tests passed in 42.1 seconds. They support the corrected capture layout because the relevant capture source remained unchanged; they do not establish a physical iPhone result.

## Baseline review and remaining delivery gates

Independent review of baseline bot output `1b03d2f20dae9f00a9fb43d45e1d28e5696cf25a` inspected all ten PNG pairs across four snapshot specs. It initially held the Goals mobile count change from 1 to 9; the diagnostic below resolved this discrepancy. Both actual main and candidate show 9 in light and dark, with unchanged goal figures. All ten candidate baselines are accepted. The earlier proof branch `92a793e2` was rejected for adding a caret before the mobile avatar and is not acceptable evidence.

The first main diagnostic [40421266230](https://github.com/Grabman1987/budget/actions/runs/40421266230) and candidate diagnostic [40421661815](https://github.com/Grabman1987/budget/actions/runs/40421661815) each passed seven tests without updating baselines. Their existing 1% pixel tolerance makes those results insufficient to establish the actual counter. A forced capture of the same Goals cases on unchanged main `c436e36`, workflow [40421945040](https://github.com/Grabman1987/budget/actions/runs/40421945040), passed seven tests in 23.8 seconds and produced diagnostic-only commit `56271d65`. Independent comparison confirmed that its actual main captures also show 9, establishing that this count is not introduced by the icon change. No matcher tolerance or financial assertion was changed. These diagnostic main PNGs are not part of this change. Complete required exact-head PR CI, integration and publication remain outstanding.

The earlier capture clipping and mobile avatar findings are resolved in the current source and included in the canonical combined run. The custom avatar is explicitly markerless; native open/close behavior remains tested. This handoff records no physical-device result and does not claim all new theme/page cases ran.
