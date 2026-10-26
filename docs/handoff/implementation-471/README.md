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

- Canonical combined workflow [40419576242](https://github.com/Grabman1987/budget/actions/runs/40419576242) ran against exact source `473452bc6a89e1b3cef7a7af8ffb46377c65b171`. It passed 35 tests in 57.5 seconds, with no failures, retries or skips. The selected set comprised the two new issue-471 icon/capture cases, the existing capture case and six screenshot cases. The workflow's screenshot-spec selection uses `grep` for `expectScreenshot`/`toHaveScreenshot`; it did **not** execute all six new Plan/year/portfolio theme cases in `e2e/issue-471-icons.spec.ts`.
- The 81 UI feature blobs are unchanged from independently reviewed `69275275` after merging main `c436e36`. This establishes source equivalence for that reviewed UI set, not new test execution.
- Earlier five-file unit evidence totals 30 tests, and a later Plan-menu rerun totals 9; later notes also record 17 focused ledger-symbol/capture-form tests. These are historical, overlapping checkpoints from earlier revisions, not additive unique totals or current exact-source proof.
- Capture screenshots in [the synthetic evidence note](../../evidence/icons-471/README.md) were captured from source `85adcf80` in workflow [40412320374](https://github.com/Grabman1987/budget/actions/runs/40412320374): 11 selected tests passed in 42.1 seconds. They support the corrected capture layout because the relevant capture source remained unchanged; they do not establish a physical iPhone result.

## Remaining delivery gates

Baseline bot output `1b03d2f20dae9f00a9fb43d45e1d28e5696cf25a` is not approved. Review found an unexplained Goals mobile screenshot count change from 1 to 9; the other eight compared screenshot pairs showed no unintended data difference. The earlier proof branch `92a793e2` was rejected for adding a caret before the mobile avatar and is not acceptable evidence.

The candidate-vs-main seven-test diagnostic [40421266230](https://github.com/Grabman1987/budget/actions/runs/40421266230) does not prove the actual Goals counter because its matcher has a 1% tolerance. A fresh main run with a forced Goals capture, workflow [40421945040](https://github.com/Grabman1987/budget/actions/runs/40421945040), is the pending evidence for that question. Do not claim baseline acceptance until its result is reviewed against the candidate. Intended baseline review, complete required exact-head PR CI, independent final review, integration and publication also remain outstanding.

The earlier capture clipping and mobile avatar findings are resolved in the current source and included in the canonical combined run. The custom avatar is explicitly markerless; native open/close behavior remains tested. This handoff records no physical-device result and does not claim all new theme/page cases ran.
