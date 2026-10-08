# F1 Monatsabschluss — synthetic evidence

Scope: `/monatsabschluss/2026-09`, guided steps 1–3, resumable audited state,
explicit reasoned exceptions and pending steps 4–5. All accounts, bookings,
categories and values in these tests and images are synthetic.

## Browser verification

`e2e/month-close.spec.ts` exercises existing inbox assignment, month-end
reconciliation, manual valuation and envelope cover actions against an isolated
ledger. It checks resume after reload, Plan/global-search entries, unchanged
booking count, pending F2 steps, phone continuation/FAB separation, horizontal
overflow and Axe in light/dark modes. Desktop: 1440 px; phone: 390 px.

The standard Windows Playwright prestart failed while invoking the shared sample
seed with `tsx` (`uv_os_get_passwd` / `ENOMEM`). The isolated-ledger fixture owns
its own server and requires neither shared sample servers nor auth setup. A
temporary config imported `playwright.config.ts`, disabled `webServer`, retained
the desktop/mobile projects and removed their setup dependencies. The scenario
and assertions were unchanged. The temporary file is removed after verification.

```ts
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  webServer: [],
  projects: (base.projects ?? [])
    .filter((p) => p.name === 'desktop' || p.name === 'mobile')
    .map((p) => ({ ...p, dependencies: [] })),
});
```

Run from the repo root after `npm run build:e2e`:

```sh
npx playwright test month-close.spec.ts --config=.month-close-playwright.config.ts --workers=1
```

| State | Desktop | Phone |
| --- | --- | --- |
| Account checks | [image](desktop-accounts.png) | [image](mobile-accounts.png) |
| Overspending / cover | [image](desktop-cover.png) | [image](mobile-cover.png) |
| Ready to continue, light | [image](desktop-light.png) | [image](mobile-light.png) |
| Ready to continue, dark | [image](desktop-dark.png) | [image](mobile-dark.png) |

## Local verification

Final affected checks: 7 files / 97 tests passed, covering the month-close API,
stepper, domain dates, investment valuation, audit dependencies, portfolio risk
policy and formatting hooks. Production and E2E builds exited 0. The final
desktop/mobile browser run passed 2 tests in 46.1 seconds, including the natural
phone footer position and keyboard-search entry after route readiness.

An earlier full gate completed with 352 of 354 files and 3,267 of 3,269 tests
passing. Its two failures were the existing 5-second portfolio-policy timeout
and the formatting hook's bounded formatter startup under load. Both passed in
the affected checks; no timeout or assertion was relaxed.

The final full-gate attempt used two threads and Vitest's filesystem module
cache with test isolation intact:
`npm run check -- -- --pool=threads --fsModuleCache` (`VITEST_MAX_WORKERS=2`).
Typecheck, ESLint and Prettier passed. The unit phase reported seven failures
(PP migration, formatting hook, portfolio allocation, investment sample,
spending-owner feedback, month-close deferral/carry and historical asset
exposure). It was stopped after a host memory check showed only 15,060 KiB free
out of 8,205,160 KiB physical RAM. This attempt has no complete test total and
does not satisfy the full local gate. The complete gate must be rerun on a host
with sufficient resources before delivery.

The subsequent single-worker recheck of all seven affected files completed:
107 of 111 tests passed (4 files passed, 3 failed). All 11 month-close API tests,
investment sample, spending-owner feedback and asset-exposure tests passed.
Two PP migration tests and one portfolio-allocation test exceeded 5 seconds;
the formatting-hook stderr assertion also failed. This recheck exited 1 and
does not replace the full gate.

## Remaining acceptance

The checkout is on `codex/month-close-1-1006`. Renaming to the requested
`codex/month-close-1004` failed with `HEAD.lock: Permission denied`; committing
failed with `index.lock: Permission denied` under the shared worktree metadata.
No commit, push or draft PR was created. The initial fetched baseline was
`6caca6fa`; main advanced to `bcd413bf` while working. Git write access and the
final rebase/delivery remain open. Do not bypass the metadata protection.

Job E was absent from the fetched main baseline. Existing assignment review and
global search are provisional; the actual verdict/palette integration remains
open. F2, CI, pinned Linux visual review and owner Gate 4 parallel-operation
acceptance remain open. No new credentials or provider consent are required.
