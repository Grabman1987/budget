# Ledger symbols, status shortcuts and theme accessibility (#595)

Refs [#595](https://github.com/Grabman1987/budget/issues/595), under [#479](https://github.com/Grabman1987/budget/issues/479). The owner explicitly retained all six existing flags on 2026-10-19. This package gives them distinct shapes and a reachable legend, preserves existing filtering and writes, and includes the reduced-motion correction needed for the current dark-theme accessibility proof. It does not complete the wider Plan work in #481.

## Preserved contract

- Red/triangle, orange/diamond, yellow/circle, green/square, blue/pentagon and purple/hexagon retain their existing stored values, German colour names, keyboard keys 1–6 and 0 for no flag. The shape supplements colour; no migration or remapping is performed.
- Three existing booking states retain their icons and meanings: vorgemerkt, bestätigt and geprüft. Status shortcut buttons change only the existing URL `status` field, retaining the other filters and reload behaviour. The desktop dropdown and phone filter form with Anwenden remain unchanged.
- Register category-class squares are omitted while category text remains; the category picker and other consumers keep their original class display. Date/amount hover and keyboard focus use existing tokens and controls.
- Only the new controls are composed into a compact phone strip and shared legend/select-all toolbar. Existing filter forms, booking-row density, checked locks and financial/undo paths are unchanged.

## Meaningful regressions

The new geometry unit regression initially found only one distinct SVG shape for six flags. The final tests require six distinct shapes, retained labels/keys, the shared legend and existing filter semantics. Targeted validation passed 7 files / 37 tests before the full check.

A controlled disposable-DOM diagnostic on the unfiltered 390×844 fixture measured the first row at y882.45 with the initial new controls and y702.45 after removing only those controls. This established a new vertical regression; it was not presented as a pristine-main or Chromium run. The correction compacts only the new controls. The new regression requires complete 44-pixel payee, amount and flag rectangles above the fixed bottom navigation. The current payee/amount bottom is y774.45 and navigation starts at y780. The existing fixed capture button can overlap the amount: the rectangle assertion does **not** establish unobscured hit testing.

The current combined browser run also exposed and then verified the shared reduced-motion fix. A universal positive transition duration could leave the stale light-theme foreground against a dark surface. Under `prefers-reduced-motion: reduce`, `transition-duration: 0s` replaces `0.01ms`; ordinary-motion rules, semantic colours and financial formulas are unchanged. Two new cases use the real desktop/phone theme controls and require normal ink, text fill, surfaces and semantic roles before and after actual viewport captures. See the separate [shared proof](../reduced-motion-481-595/README.md).

## Final local verification

The verified application tree was current main `f3aafd78e2832bbe3110dde436ecfb5eaebafa80` plus shared correction `5be538a0712394bd81058f7f6de28120c99e5598` and the ten frozen #595 files. All eighteen source/test/shared-evidence hashes stayed unchanged through both final runs. Only this delivery document, the accompanying safe JSON and copied actual screenshots were added afterwards.

| Check | Actual result |
| --- | --- |
| Fresh `npm run build:e2e` | Exit 0 |
| Canonical real-WebKit selection, one worker | 9/9 passed; 100.194 s; no skips, flaky cases or unexpected results |
| Selected cases | Three setup, two new #595, two unchanged #581, two new shared theme cases |
| `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2 npm run check` | Exit 0; 507 files / 4495 tests; Vitest 392.09 s |
| Normal `npm run build` | Exit 0 |
| Frozen head and eighteen hashes | Unchanged after both runs |
| Independent source and current-image review | CLEAR; all eight register/account images, four shared viewport images and the first-viewport guard image opened |

The full check retained an existing unused `eslint-disable` warning at `packages/ui/src/components/panel.tsx:208` and JSDOM's `Not implemented: Window's scrollTo() method` messages. Build size notices remain warnings. No rules, tests or tolerances were weakened to obtain these results.

The functional case uses only a synthetic isolated ledger: opening 100000 cents, one checked −199-cent booking and six flagged bookings of −101 through −106 cents. Literal booking sum is −820 cents and account balance 99180 cents. Combined account/category/flag/text/date/sort filters, reload, status changes, reconciliation locks, flag persistence and real undo are checked. All existing tests are unchanged.

## Actual images and limits

The images below are the current combined run's actual outputs, not refreshed golden baselines. Real WebKit 27.2 uses the canonical 390×664 coarse-pointer phone profile (DPR 3); the first-viewport guard separately uses 390×844. Native pointer assertions require touch on phone and mouse on the explicit 1440×900 desktop layout context (fine pointer, no touch, DPR 1). Its inherited phone user agent/screen metadata means it is a WebKit **desktop-layout** proof, not Chromium acceptance. The explicit desktop page uses the host date while the isolated server/phone fixture uses 2026-10-02; all records are synthetic and these are not date-pinned baseline images.

Full-page phone captures retain the fixed navigation at the original viewport edge. They show below-the-fold content and do not establish that every row or open legend is initially visible without scrolling. The original unfiltered Chromium first-viewport test remains unchanged and remains a required compatibility check.

| Surface | Light | Dark |
| --- | --- | --- |
| Register, WebKit phone | [PNG](symbols-webkit-iphone-light.png) | [PNG](symbols-webkit-iphone-dark.png) |
| Register, WebKit 1440 desktop layout | [PNG](symbols-webkit-desktop1440-light.png) | [PNG](symbols-webkit-desktop1440-dark.png) |
| Account, WebKit phone | [PNG](account-webkit-iphone-light.png) | [PNG](account-webkit-iphone-dark.png) |
| Account, WebKit 1440 desktop layout | [PNG](account-webkit-desktop1440-light.png) | [PNG](account-webkit-desktop1440-dark.png) |

[Unfiltered 390×844 guard](unfiltered-first-controls-390x844.png) · [Safe runtime results and hashes](runtime.json).

Current light/dark Axe, overflow, 44-pixel targets, native legend interaction and desktop hover/focus assertions passed for both register and account. Shared normal-text contrast ratios after actual theme changes are at least 10.59:1, with the distinct semantic token colours retained. Raw traces, sessions and databases remain outside the repository.

Required exact-head Chromium/Windows CI, baseline review where required, serial integration and deployed revision remain open. These local results do not close #595 or #481. Local Budget Impeccable, Ponytail, verified-delivery and security-review adapters were used; no unavailable upstream design-engine execution is claimed.
