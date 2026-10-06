# UX-3d — Phone booking filters

Scope: Konten › Buchungen only. Below 768 px, search and Filter (n) share a row.
The existing native BottomSheet contains the existing filter controls and sorting.
Filter edits and reset remain a draft until Anwenden; close/Escape discard it.
Applied filters stay in the existing validated URL and appear as removable chips.
Search and sorting do not count as restrictions; each date bound counts separately.
Exact-booking and payee result links also count and remain removable. Reset preserves
search, removes restrictions and restores newest-first sorting. Desktop retains its
inline controls and original labels. No dependencies or shared UI changes.

## Tests and visuals

- `bookings-search.test.ts`: synthetic filter counting including deep links and empty values.
- `ledger-filters.spec.ts`: phone 390 px apply/discard/reset/chips/reload, first booking in
  viewport, search alongside button, focus return, short sort copy, light/dark axe and overflow;
  desktop inline filters and immediate URL updates.
- Existing ledger/account order/grouping browser specs open/apply the mobile sheet.

No committed ledger screenshot baseline exists. The phone booking-list and filter-sheet
captures in `ledger-filters.spec.ts` are affected; they are evidence captures, not baselines.
Existing shell/component/account-detail baselines should remain unchanged. No screenshot
baselines were regenerated locally. Review the new ledger captures on pinned Linux CI.

Synthetic captures: [desktop 1440](evidence/ux-mobile-ledger-1005/desktop-1440.png),
[phone light](evidence/ux-mobile-ledger-1005/phone-light.png),
[phone dark](evidence/ux-mobile-ledger-1005/phone-dark.png),
[sheet light](evidence/ux-mobile-ledger-1005/sheet-light.png),
[sheet dark](evidence/ux-mobile-ledger-1005/sheet-dark.png).

## Local verification

- Filter-count unit test failed first, then passed: 5/5 tests.
- `npm run check` started once. All workspace typechecks and lint/formatting passed.
  The full unit run had 3,221 passed and seven failures in six unchanged files:
  six five-second timeouts and the known formatter-hook 800/900 ms process limit.
  Only those six files were rerun with one worker and a 30-second test timeout;
  all 95 tests passed, with no assertion or committed timeout changes in those files.
- Production and E2E builds passed.
- Four affected browser specs on desktop/mobile: 19 passed, four planned skips,
  two timeouts while creating the browser page, before scenario assertions.
  The two affected files were rerun with a 90-second CLI timeout: six passed,
  three planned skips. The new phone filter scenario passed in 13.9 seconds.
  Both themes passed axe and horizontal-overflow checks; desktop inline filters passed.
- The Windows sandbox's `os.userInfo()` fails with `uv_os_get_passwd ENOMEM`,
  preventing the stock tsx sample seed from starting. Local browser runs used an
  ignored temporary config with the same synthetic seed bundled by existing esbuild,
  the same databases, setups and assertions. The committed config stays unchanged;
  stock pinned Linux CI and owner acceptance remain open.

## Owner steps

Review the synthetic desktop/phone captures and try search, apply, close without applying,
chip removal and reset on the original phone in both themes. Wait for required CI before
merge. No keys, consents, migration or provider setup is required.
