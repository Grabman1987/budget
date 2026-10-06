# E3 command palette

The existing header search and phone search button now share a fuzzy palette for
pages, every catalog report (position, slug and name), open accounts, categories,
contacts, payees and the latest 200 bookings (including native amounts). Recent
choices are prioritized before the per-kind server limit; only eight IDs are kept
in session memory, with fresh server validation on reopening. No dependencies,
provider calls or booking mutations were added.

The four actions reuse capture, Posteingang, account reconciliation and device
amount privacy. **Monatsabschluss starten** opens Konten with the hint
**Zuerst Kontostände prüfen**; the app has no month-close wizard. The `?` help uses
the existing capture shortcut text and flag key/label lists. Native dialogs retain
Escape, focus return and keyboard scrolling; arrow keys and Enter select results.

Synthetic regression tests first reproduced missing recent choices beyond the
five-result limit, the omitted default-register name (Nettovermögen), and lost
focus after closing shortcut help, and Escape on the desktop help button. Each
correction was then verified. API tests also cover session protection, deleted
entities, closed accounts, malformed history and literal search characters.

## Verification (2026-10-06, Windows)

- Focused API/domain/UI regressions: **61/61 passed**.
- Full `npm run check -- -- --maxWorkers=1 --fsModuleCache`: typecheck,
  ESLint and Prettier passed; **352/354 test files passed**, with 3316 tests
  passed, one timed out and two skipped after a setup-hook timeout. The unchanged
  payslip-intake case exceeded 5 seconds; the unchanged assets-debts-history
  sample setup exceeded 10 seconds. Both files then passed **15/15 tests** in
  an isolated run with the original limits.
- Fresh `npm run build:e2e` and production `npm run build`: passed.
- `global-search.spec.ts` and `shell.spec.ts`, desktop and phone, one worker:
  **51 passed, 10 viewport-specific skips, six failed on existing time limits**.
  Both new palette/action/help cases passed, including Escape/focus return and
  zero Axe violations for help in both themes. Remaining failures cover desktop
  empty results, phone booking/response waits, both 66-route sweeps and the
  desktop dark-shell load.
- Production-bundle search suite, one worker and one allowed retry: **13 passed,
  one flaky, one viewport-specific skip, two failed**. Every phone case passed
  on its first attempt. The desktop palette/help case passed on retry after its
  first Axe page setup exceeded the 30-second test deadline. The two remaining
  desktop empty-result/response waits exceeded the original 5-second limits.

Shared host memory pressure was observed during these runs. Isolated passes do
not turn the failed full gates green. An additional full run configured for the
supported thread pool passed typechecks but was interrupted during lint as the
host slowed again; no threaded unit tests were executed. Capacity samples after
stopping that additional check ranged from 6 to 274 MiB free. No timeouts or
assertions have been weakened. Full check/browser gates remain open.

## Visual evidence

Only the repository's synthetic ledger appears in these screenshots. Windows
with Playwright 1.56.1 / Chromium, desktop 1440 × 900 and phone 390 × 844:

| View | Desktop | Phone |
| --- | --- | --- |
| Search, light | [Screenshot](search-light-desktop.png) | [Screenshot](search-light-mobile.png) |
| Search, dark | [Screenshot](search-dark-desktop.png) | [Screenshot](search-dark-mobile.png) |
| Shortcuts, light | [Screenshot](shortcuts-light-desktop.png) | [Screenshot](shortcuts-light-mobile.png) |
| Shortcuts, dark | [Screenshot](shortcuts-dark-desktop.png) | [Screenshot](shortcuts-dark-mobile.png) |
| Header access, light | — | [Screenshot](search-access-light-mobile.png) |
| Header access, dark | — | [Screenshot](search-access-dark-mobile.png) |

Linux screenshot comparisons use the existing pinned Playwright image and remain
a CI/review step; Windows does not regenerate those baselines. Owner acceptance
on a physical phone and macOS keyboard remains open. No keys or consents are
needed for this change.
