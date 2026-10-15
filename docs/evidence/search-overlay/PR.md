# Search overlay and sidebar resize evidence

Global search opens over the current page, keeping the source URL, month, scroll position and meaningful keyboard focus. Escape restores the context that opened it. The native dialog remains the mobile full-screen sheet. Search destinations, validated `/suche?typ=` filtering, loading/error states, pending-result handling and recent choices reuse existing routes and providers; financial calculations and write paths are unchanged.

The desktop navigation sidebar now has a hover-revealed resize handle. Pointer dragging and slider keyboard controls adjust it from 200 px to 360 px; the selected width persists across reloads. The collapsed sidebar hides the handle and restores the selected width when expanded.

## Validation

- `npm run check` passed on Node 22: 433 test files, 3,914 passed and 2 skipped (3,916 total). Typechecks, lint, CSS token check and formatting also passed; ESLint reported one existing unused-disable warning in `packages/ui/src/components/panel.tsx`.
- `npm run build:e2e` passed.
- Chromium desktop and mobile focused suite: 25 passed, 2 skipped (`e2e/global-search.spec.ts` and `e2e/sidebar-resize.spec.ts`, 2 workers). Covers the 1440×900 and 390×844 viewports, pointer and keyboard resize, width limits and persistence, search navigation and context preservation, Escape focus return, and Axe in light and dark themes.
- WebKit iPhone focused search suite: 12 passed, 1 skipped, 1 failed (1 worker). Search keyboard/focus, context restoration and Axe cases passed. In the existing “result types open existing category, payee, contact and exact booking views” flow, WebKit crashes at `page.reload()` (`e2e/global-search.spec.ts:84`) after the earlier contact search result was opened, reloaded and left via “Zurück zu Kontakte”. `DEBUG=pw:browser` captured a WebKit child assertion in libstdc++ `optional` (`_M_is_engaged()`), followed by `Page crashed`; cgroup `memory.events` showed no max/oom/oom_kill events.
- Direct entry and reload of `/konten/buchungen?buchung=bk-004219` passed on both this build and the read-only `/workspace/work/payslip` build with the same WebKit runtime, synthetic sample database and session. The crash is not specific to the overlay: running the existing full-page-search test against the read-only Payslip/main build also reproduced the WebKit assertion and `Page crashed` at its booking `page.reload()` after contact search result → contact reload → “Zurück zu Kontakte” → booking search result. Direct contact-route reload/back and direct booking reload passed. A trial that synchronously closed the overlay and restored focus before navigation did not remove the overlay-flow crash. GitHub CI independently failed the same existing result-navigation test on `[webkit-iphone]` at booking `page.reload()` (`e2e/global-search.spec.ts:84`); its annotation reports 336 passed, 35 skipped, and one failure in shard 3. The exact native crash detail remains unavailable because the 65 MB report and job log return Azure Blob `403 Forbidden`, but the failing browser/test/step are confirmed. No test assertion or browser configuration was weakened.

## Screenshots

Generated from the synthetic sample ledger. They are evidence, not regenerated visual-test baselines.

![Search overlay, desktop light](fresh/overlay-light-desktop.png)

![Search overlay, mobile dark](fresh/overlay-dark-mobile.png)

![Sidebar resize, desktop light](fresh/sidebar-resize-light-desktop.png)

![Sidebar resize, desktop dark](fresh/sidebar-resize-dark-desktop.png)

## Scope and remaining acceptance

This work addresses search issue #484 and the resize criterion in #499. It does not close all of Q5 / #468: mobile tab labels, header/status behavior, FAB overlap, focus/back navigation beyond the covered search flow, sidebar groups and offline status remain separate acceptance findings. Owner acceptance on a physical iPhone and desktop is still outstanding. No keys, consents, migrations, configuration or deployment steps are required.
