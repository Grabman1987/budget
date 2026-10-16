# Wealth-stage allocation evidence

All execution used the managed cloud environment and synthetic data. No private workbook, provider identifiers or production configuration was published.

## Browser and build

- Node 22 build (`npm run build:e2e`) passed.
- `asset-classes-settings.spec.ts` and `portfolio-allocation.spec.ts`: **16 passed**, one worker; desktop Chromium 141 diagnostic runtime plus current Playwright 1.64.1 WebKit 2370 at iPhone 390px. The required GitHub CI Chromium matrix is a separate gate; the local diagnostic Chromium is older.
- Existing dirty/template guards, pending-save navigation, future versions, archive/restore, scoped totals and target undo/redo remain asserted. The exact old template selector was updated because new template mapping labels also contain that word. No assertion, screenshot or Axe rule was removed.
- New flow: explicit class mapping, seven stages, excluded wallet, grouped German threshold `500.000,-`, all conditional stages disabled in the submitted draft, exact cent payload, conflict message and discard. Both light and dark modes run the full Axe scan. A screenshot before Axe ensures that WebKit has painted the theme change; the first scan caught a stale light hover background during the dark transition and the repeated painted check passed without suppressing contrast validation.
- [Desktop light](desktop-light.png), [current WebKit phone dark](webkit-phone-dark.png). Desktop editor is 960px; its class controls use two columns. Phone retains one column, readable labels and the existing focus/close contract.
- After the 16-pass run, the new synthetic template test was isolated from concurrent workers by explicitly selecting the three seeded class IDs plus its own created class; that narrowly changed test passed its separate **5/5** setup/Desktop/WebKit run. The sample class is undone in `finally`.

## Financial regression

The focused four-file run initially caught a missing required role in the newly written synthetic fixture. After fixing the fixture, the API suite passed **11 tests**; the other **19** focused domain/database tests had already passed. Literal regressions cover exact 500,000-euro activation, one cent below, legacy-boundary round-trip, a one-cent second stage, seven specified percentage arrays, negative/unknown totals, optional approval fallback, atomic account/target rollback, concurrent changes and grouped undo/redo.

The complete Node22 check passed: **434 test files / 3,965 tests**, zero skips, typecheck/lint/format green (one pre-existing unused ESLint-disable warning). The exact checkpoint and continuation are recorded in the handoff. CI and live delivery are not inferred from these local results.

## Skills and review

- Impeccable: pinned launcher inspected; one `context --target apps/web/src/wealth/target-panel.tsx` call; one `detect --json` over the four changed UI targets returned `[]`. The context tool misread an older owner directive as the platform field; the actual stack was confirmed as React/Vite web. No generic design initialization was run.
- Ponytail adapter: reviewed the existing shared policy resolver, legacy serialization, callers, account invariants and audit transaction instead of creating a parallel allocation engine. No dependency or migration was added.
- UI UX Pro Max query: `complex financial form progressive disclosure validation --domain ux --max-results 3`. Relevant results were submit feedback and explicit form labels; existing loading/error/undo feedback and shared labelled fields were retained. The generic on-blur-validation recommendation did not replace the existing submit guards and live sum.
- Hallmark/Blueprint audit: widened the desktop work form, retained tokens/fonts and readable signed values, folded the example chooser after loading, and checked the rendered desktop/phone forms. This is scoped evidence, not a claim that every app page is audited.
- Figma skills: native component instances, bound semantic colors, auto layout, font inspection, final geometry and screenshots. Eight source/prototype additions, zero invalid new destinations; the two START indexes now expose 170 scenarios. Design snapshot: `design/blueprint-revision-04` at `618b54d8`.

The conditional-stage default is still a product decision. The draft is not merged, no targets were seeded into production, and no trading or savings orders were made.
