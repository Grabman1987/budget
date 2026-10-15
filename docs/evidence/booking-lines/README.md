# Booking lines — #463

The capture dialog uses the existing integer-cent booking-line mapper from
`8f659a19`. Category-only, whole-contact outlay, percentage share, fixed share and
several categories/contacts use one editor. Stored splits retain their independent
rows, order and metadata when edited; the ledger does not store gross-line grouping.
Existing create/patch, undo and reconciled-lock boundaries remain in place.

The visible head precedes the lines on desktop and phones: amount, payee, account
and status, then date/repetition in 2:1 columns. Direct German dates and the native
calendar remain. Date chips, the separate outlay field and Split button are replaced
by the category/contact picker, Teilen and Weitere Kategorie. Four slim category
suggestions share one horizontal rail. The body scrolls independently of the save
footer. At 390px the compact two-row header retains visible flag/close labels and 44px
targets. Smaller field gaps keep the category in the first viewport without
hiding account/date controls or the arithmetic hint. Accessible names remain intact.

## Verification

- Fresh focused unit run: **73 tests in six files passed** with one thread worker.
  Covers largest-remainder allocation, refunds, exact payloads, retained metadata,
  stale payee caches and undo of inline contact creation.
- Fresh web typecheck and the E2E-mode application build passed. Changed-file ESLint,
  Prettier, CSS scale and diff checks passed. Full required CI remains the integration gate.
- **30 browser/setup cases passed** in `capture-dialog-layout.spec.ts`: desktop
  1440px, Chromium mobile 390px and WebKit iPhone 390px. All five scenarios preserve
  exact split values and memo-only edit round trips. The tests retain rest/save
  guards, Enter, dirty Escape/outside-click protection, initial focus, light/dark
  Axe, both 44px target dimensions and actual viewport/header overflow guards.
- A red phone regression exposed hidden account/date controls and the wrong Tab
  order. The head now remains visible before the lines on every viewport. The
  original capture/calendar/dropdown regression was restored and adapted to the
  new controls, retaining its German dates, exact 19.99 split, status, flags,
  draft preservation, footer and accessibility assertions.
- Headless WebKit can deliver native-calendar Escape to the dialog. The test
  observes actual Escape/cancel delivery and verifies the existing dirty guard
  and retained draft in that case. Chromium retains its original strict popup
  dismissal assertion. Production Escape behavior is unchanged.
- Theme audits await finite CSS animations before running Axe. This prevents a
  background-only theme transition from mixing the new foreground with the old
  background; contrast assertions and the application's colors are unchanged.

Commands use `NODE_OPTIONS=--max-old-space-size=1536`, one worker,
`E2E_PORT=5080` and `E2E_LEDGER_PORT_OFFSET=100`.

```sh
npx vitest run apps/web/src/ledger/capture-form.test.tsx apps/web/src/ledger/split-editor.test.tsx apps/web/src/ledger/booking-lines.test.ts apps/web/src/ledger/booking-model.test.ts apps/web/src/ledger/split-rest.test.ts packages/domain/src/ledger/booking-lines.test.ts --maxWorkers=1 --pool=threads
npx playwright test e2e/capture-dialog-layout.spec.ts --workers=1
```

After integrating Q1 and the cash directive, the final run passed all 30 dialog/setup cases, including four
suggestions in a bounded horizontal rail and access to its last button. Fourteen
additional targeted cases passed (three existing desktop-only phone skips):
category capture, shortcut help on desktop/mobile, light/dark mobile-panel geometry
and the original touch/visible-label checks on Chromium and WebKit.

The shortcut help now asserts the complete owner-approved Enter/Ctrl+Enter/Escape
text in unit and browser tests. All 56 search unit tests pass. Before reopening
search after navigation, the browser test also verifies that the old search input
has unmounted; URL changes alone were too early. Panel geometry measures the
painted interval of suggestion children clipped by their scroll rail, while the
rail itself and every other element retain the original overflow assertions.

## Evidence and remaining gates

The 30 `<project>-<scenario>-0-<theme>.png` files were refreshed from the passing
scenario run using synthetic data. They are ordinary evidence, not Playwright
baselines. Desktop light and WebKit dark examples were visually reviewed. Linux
baselines are generated only by GitHub's snapshot workflow.

The wider five-spec capture/register run passed 53 cases; the two obsolete empty-amount
footer-click expectations were adapted to assert the new disabled-save reason and
an invalid-date footer click with the payee dropdown open. Both corrected variants
passed in a separate five-case desktop/mobile/setup run. All original balance,
confirmation, lock, undo/redo and no-write-before-save assertions remain.

Final-head CI, serial deployment and
the live revision must pass before closing #463. Physical-iPhone owner acceptance
remains separate from automated WebKit coverage.

## Cash capture and current-main regression (2026-10-15, #499)

New cash capture is immediately confirmed, with its visible status control disabled. Bank capture retains pending/manual confirmation; existing edited/reconciled records keep their stored state. The new browser case switches cash → bank → cash and verifies the saved 1,234-cent confirmed inflow on all three engines/viewports. The original bank toggle/repetition checks remain.

Fresh web typecheck, changed-source ESLint, CSS scale and E2E build passed. The 73 focused financial unit tests passed. After the 30 dialog/setup cases, 21 affected browser/setup cases passed (three existing desktop phone-only skips): cash acceptance, keyboard focus, register/repetition/preview, payee suggestions, bank confirmation, shortcut help, light/dark clipped-rail geometry and the original visible-label/touch checks. All 30 evidence images were refreshed with the current Q1 colors; mobile light and WebKit dark were reviewed.

This slice changes capture defaults. The remaining account-purpose, transfer/import and contact/chart requests stay open in #499.
