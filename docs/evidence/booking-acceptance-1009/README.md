# Booking dialog acceptance — 2026-10-09

Package: Refs #309, Refs #314, Refs #315. Lane: Daten/Werkzeug.
Branch: `codex/pkg-h-booking-acceptance-1009`.
Baseline HEAD: `6f603966779ed370dae4e8ac5290d3a942dfa670`.

**Exact-head acceptance remains blocked.** These are local worktree results, not
acceptance of the unchanged baseline commit. Git cannot create the shared worktree
`index.lock` (Permission denied), so the changes could not be committed. Each
capture's JSON records HEAD, the nonempty worktree status, viewport, reduced-motion
emulation and the rendered accessibility tree. `source-hashes.json` identifies the
three changed implementation/test files. Required CI has not run for this package.

The existing #222/#251 booking implementation is retained. The separate #252 test
integration (`e2e/booking-ux.spec.ts` and the configured CI) is unchanged and must
also pass in required CI; its historical evidence does not certify this worktree.

## Acceptance matrix

| Issue / criterion | Local result | Evidence |
| --- | --- | --- |
| #309 German date, arithmetic amount, defaults and visible Save | Pass in light/dark at 1440 × 900 and synthetic 390 × 844. `1.234,56+0,01` becomes `1.234,57`; `07.10.2026` saves as `2026-10-07`, exactly −123457 cents, once, to the default cash account/category/payee, confirmed. | `e2e/booking-acceptance.spec.ts`, booking captures below |
| #309 height and phone layout | Pass: sheet ≤88dvh, fully bounded by the viewport, no horizontal page/dialog overflow, visible controls ≥44 × 44 px, expanded content scrolls above the visible Save footer. With a category default, Available and suggestion rows put Mehr below the initial body viewport; scrolling reaches it without moving Save. | Mobile compact/expanded captures; geometry assertions |
| #309 required CI at exact HEAD | **Open**: no new commit/PR or exact-head CI can be obtained in this runner. | Delivery limits below |
| #314 dark Heute | No contrast defect found in the bounded synthetic review. Main-content axe has zero violations; actual/forecast use solid/dashed lines and textual tooltip series names. | Heute captures; `apps/web/src/heute/charts.tsx` (BalanceChart), `packages/ui/src/styles/charts.css`, dark token sources below |
| #314 dark booking form | No contrast defect found. Labels, amount/date, selected status and Save remain readable; dialog axe has zero violations. | Dark booking captures; `apps/web/src/ledger/ledger.css`, `packages/ui/src/styles/tokens.css` |
| #315 keyboard / screen-reader focus semantics | Two defects reproduced and corrected: Tab after Save reached browser chrome; the discard alertdialog appeared without receiving focus. BookingPanel now wraps Tab/Shift+Tab and focuses Weiter bearbeiten, traps the question's two actions and returns to the prior control on continuing. Escape/discard return to the opener. | Runnable keyboard regression and discard-focus captures/ARIA JSON |
| #315 labels, non-colour status, reduced motion | Pass for the tested capture path: labelled fields/actions, pressed states plus visible status words, signed amounts, named discard question; no active animation or transition duration above the reduced-motion limit. | Keyboard regression, axe and ARIA JSON |

The focused path visits amount → payee → account → relative-date actions → date →
status → category → Mehr → split action → repetition → note → contact → Save and
new → Save → flag → booking kinds → close → amount, with both boundary directions
checked. Keeping input restores focus to amount and retains the draft; discarding
creates no booking. This is browser accessibility-tree/focus verification; an
actual assistive-technology session is still an owner step.

## Visual review and contrast

The precision layer's existing fonts, surfaces, blueprint palette and spacing are
retained. Only the booking wrapper/focus behavior and a `display: contents` rule
change; Heute is read-only in this package.

| Viewport | Booking light | Booking dark | Expanded dark | Discard focus (light) | Heute dark |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 | [Capture](desktop-booking-light.png) | [Capture](desktop-booking-dark.png) | [Capture](desktop-booking-dark-expanded.png) | [Capture](desktop-booking-discard-focus.png) | [Capture](desktop-heute-dark.png) |
| 390 × 844 | [Capture](mobile-booking-light.png) | [Capture](mobile-booking-dark.png) | [Capture](mobile-booking-dark-expanded.png) | [Capture](mobile-booking-discard-focus.png) | [Capture](mobile-heute-dark.png) |

Booking screenshots show the viewport; Heute screenshots show the full synthetic
page. Matching `.json` files contain the accessibility trees. These are review
captures, not snapshot baselines. No baseline was regenerated; no existing
versioned visual baseline includes this dialog (see `docs/ux-booking-dialog-1005.md`).
Shared component baselines remain unchanged. Heute source is unchanged.

WCAG sRGB luminance ratios, calculated from the existing dark tokens in
`packages/ui/src/styles/tokens.css:95` (also defined for the system preference at
line 49): ink/ground **12.20:1**, ink-2/ground **8.38:1**, ink-3/ground **5.87:1**,
ink-3/raised **5.09:1**, chart line/ground **10.91:1**, Save on-primary/primary
**12.20:1**. `packages/ui/src/styles/charts.css:9` applies ink-3 to axis labels;
actual/forecast have distinct line styles. These representative opaque pairs
complement axe and screenshot review; they do not claim an exhaustive product
contrast audit or physical-device acceptance.

## Verification

Windows / Chromium, existing installed dependencies. Only this new E2E spec was
run, with the normal configured servers, sample seed and setup projects retained.
No fixture, server, assertion, snapshot baseline or CI check was disabled.

- Web package `tsc`: exit 0.
- ESLint on the changed TS/TSX, Prettier on changed code files and the existing CSS
  typography/radius scale check: exit 0. Documentation is excluded by the repo's
  Prettier configuration.
- Affected Vitest files (`capture-form`, `capture-model`, `booking-model`):
  **3 files / 46 tests passed**, 25.14 s, one worker.
- `npm run build:e2e`: exit 0, run once. After the reproduced focus defects were
  corrected, the web bundle alone was rebuilt in E2E mode; final build exit 0.
  Existing Rollup annotation, mixed-import and chunk-size warnings remain.
- Desktop targeted E2E: **6 passed** in 57.7 s, including 3 setup tests.
- Mobile targeted E2E: **6 passed** in 1.2 min, including 3 setup tests.
- `git diff --check`: exit 0. The index remains unchanged/unstaged.

The initial acceptance probe failed on the two focus defects before the fix.
Test-authoring corrections used the existing accessible names (payee options
include their category hint; the flag is named Markierung: keine; Heute uses a
focusable chart group). A category default requires scrolling to Mehr. Reduced
motion is explicitly emulated and asserted: putting it into `test.use` did not
set this browser option. The later duration check caught that missing emulation;
the unchanged reduced-motion CSS passes with the real preference set.

An extra standalone E2E TypeScript probe is outside the package's workspace
typecheck: after correcting the unsupported option in the new spec, it still
reports the pre-existing fixture typing in `e2e/sample.ts:18` (`option` in the
colorScheme tuple). That shared helper is unchanged. The repository's configured
workspace typechecks do not include E2E sources; browser tests execute it normally.
This finding is preserved, not suppressed.

Full local `npm run check` and the full E2E suite were intentionally not run under
the owner's parallel-machine constraint. Final gates remain the unchanged required
`check`, `check-windows`, `docker`, `restore-test`, on a committed PR head.

Reproduce in PowerShell (use `.cmd` when script execution is restricted):

```powershell
npm.cmd run build:e2e
$env:E2E_PORT='4920'
$env:E2E_START_TIMEOUT='300000'
npx.cmd playwright test e2e/booking-acceptance.spec.ts --workers=1 --project=desktop
npx.cmd playwright test e2e/booking-acceptance.spec.ts --workers=1 --project=mobile
```

## Delivery limits and owner steps

- `git add` / `git commit`: shared `index.lock` creation denied. No commit was made;
  working files remain modified and the index was not staged. A clean worktree
  cannot be claimed without losing the requested work.
- `git push -u origin HEAD`: `schannel: AcquireCredentialsHandle failed:
  SEC_E_NO_CREDENTIALS`. No alternative publication path was used.
- Normal PR creation returned **HTTP 401: Requires authentication**. The ready English body
  is in [PR.md](PR.md); use the requested title from the task.
- Owner: commit these files from an environment with writable worktree Git
  metadata, restore normal GitHub authentication, push and open the single normal
  PR, then require all four checks on its exact final SHA. Rerun the focused spec
  from a clean head and retain the new SHA/viewport/ARIA artifacts before accepting
  #309. Review dates/defaults/Save and the two focus changes on a physical phone
  and with the owner's screen reader. No keys, consents, migration, provider API,
  merge or deployment is needed for this package.
