# PWA shell and offline booking queue (Y26)

Scope: installable application shell, static-asset offline availability and an
explicit update prompt, plus device-local booking capture and reliable retry.
The existing Budget brand mark supplies the icons.

Only build-generated, same-origin static assets belong in Cache Storage. API,
authentication, exports and health responses must always use the network. An
offline start displays the shell's connection explanation without financial
figures; it must not imply that a booking has been saved.

An update waits for the user to finish their work and accept reloading. Passkey
ceremonies and `/health` retain their existing network behavior.

New captures are written to IndexedDB before their first POST. Offline captures
remain on this device, outside balances and budget calculations, in “Wartet auf
Verbindung” on Heute/Konten, with counts in desktop and mobile navigation.
The owner can edit or delete unsent/rejected items with the existing capture form.
An open queue editor survives reconnection and holds delivery of that item until
the owner saves or closes it; later captures retain FIFO order.
Physical iPhone installation and passkey acceptance remain separate checks.

The Vite build emits `sw.js` with a content-derived version and an explicit list
of build/static files. It precaches the shell and lazy chunks, never expands its
cache from runtime requests, bypasses `/api` and `/health`, and keeps one prior
shell for open tabs. Installation does not force activation. The user selects
"Jetzt neu laden" to activate the waiting worker; online/focus events check for
updates. Financial data remains memory-only under the existing Query client.

An offline launch does not mount financial routes. It shows the durable queue and
allows capture using previously loaded form choices. Only required account,
category, contact, income-type and project selections (ids/labels and capture
semantics) persist alongside booking fields. No balances, financial reads, receipt
files, session/cookie/passkey state or secrets are persisted. The device must load
capture choices online once; the server validates them again at delivery.
Losing the connection after starting keeps unsaved fields mounted and labels
displayed data as potentially stale. Production-only registration keeps the Vite
development server unaffected.

Delivery uses the normal session/origin-protected POST `/api/bookings`, in capture
order, on online, window focus, restored login or “Jetzt senden”. A rejection holds
later items until the owner corrects/removes it. Session expiry never deletes the
queue; a valid login resumes delivery. Closed/deleted accounts and deleted
categories produce actionable German reasons. Typed month/reconciliation lock
errors are retained too; the current server has no month-close write-lock model,
so this feature introduces no new month-close policy.

Each item has a stable UUID `Idempotency-Key`. Migration `0022_booking_delivery`
stores the validated request hash and original result atomically with the booking,
transfer legs, new payee and audit group. Same key/body returns the same result;
different fields return 409. Receipts survive booking edits/deletion/undo and server
restart, preventing replay from recreating a removed booking. Failed validation
rolls back all writes and does not claim the key.

A lost response or interrupted send has an uncertain outcome. Its original body
and key remain immutable until a retry resolves the server result. The UI explains
why edit/delete is temporarily disabled. This also covers interrupted local
deletion after a successful POST. IndexedDB transaction completion is required
before claiming a local save; storage failures leave the form open. Web Locks
serialize queue delivery/edit/delete across tabs where available; the per-page
fallback and server idempotency still protect repeat delivery.

Background Sync, when available, only wakes open clients to run this same delivery
path. It never caches API responses or stores credentials and is not required on
iOS. Closed-app background delivery is not promised. Browser/site data deletion
can remove unsent captures; they are device-local and outside server backups.

Tests: `apps/web/src/pwa/queue.test.ts`, booking-key API cases in
`apps/server/src/api/api.test.ts`, and `e2e/offline-queue.spec.ts` with fixed time,
`context.setOffline`, cold reload, local edit/delete, uncertain response replay,
closed account and restored session. Existing PWA/capture regressions remain in
scope. Screenshots in `test-results/queue-*-{light,dark}.png` are synthetic review
evidence, not new pixel baselines or physical device acceptance.

The PNG icons rasterize the existing `BrandMark` SVG geometry in
`apps/web/src/shell/sidebar.tsx`, with padding for maskable launchers; no new
brand or remote image is introduced. Installation needs HTTPS (localhost is
only for tests).

Verification commands and results are recorded in the pull request; visual
baselines are not regenerated on Windows. The Chromium installability protocol
is used to check the manifest, icon and worker criteria directly; it is not an
invented Lighthouse score or physical iOS acceptance.

## Changed files

- Queue/PWA: `apps/web/src/pwa/queue-store.ts`, `queue.ts`, `queue-ui.tsx`,
  `pwa.tsx`, `pwa.css`; `apps/web/pwa/service-worker.js`; `apps/web/src/main.tsx`.
- Capture: `apps/web/src/api/http.ts`; `apps/web/src/ledger/api.ts`,
  `booking-panel.tsx`, `capture-form.tsx`, `capture-model.ts`, `mutations.ts`,
  `split-editor.tsx`.
- Navigation: `apps/web/src/shell/app-shell.tsx`, `mobile-chrome.tsx`, `sidebar.tsx`.
- Server/database: `apps/server/src/api/bookings.ts`, `schemas.ts`;
  `packages/db/src/schema/system.ts`; `packages/db/drizzle/0022_booking_delivery.sql`,
  `meta/0022_snapshot.json`, `meta/_journal.json`.
- Tests: `apps/web/src/pwa/queue.test.ts`, `pwa.test.tsx`;
  `apps/web/src/auth/api.test.ts`; `apps/server/src/api/api.test.ts`;
  `packages/db/src/payroll-migration.test.ts`; `e2e/offline-queue.spec.ts`.
- Documentation: `docs/FEATURES.md`, `docs/ROADMAP.md`, `docs/pwa.md`.
- Synthetic screenshots: `docs/evidence/offline-queue/{desktop,mobile}-{light,dark}.png`.

## Local verification

- `npm ci --no-audit --no-fund`: installed dependencies; lockfile unchanged.
- `npm run typecheck` and `npm run lint`: passed.
- `npm test -- --maxWorkers=4 --testTimeout=30000 --hookTimeout=30000`:
  all 233 files and 2,247 tests passed. Focused queue/API/storage/session cases also passed.
- `npm run build` and `npm run build:e2e`: passed, with existing bundler warnings.
- `E2E_PORT=4480 npx playwright test --config dist/offline-playwright.config.ts
  e2e/offline-queue.spec.ts --project=desktop --project=mobile --workers=1`:
  all six queue scenarios plus both setup cases passed against the final production build.

The Windows sandbox cannot start the unrelated `tsx` sample server
(`uv_os_get_passwd / ENOMEM`). An ignored local config in `dist/` extends the normal
Playwright config, uses the ordinary main server and desktop/mobile projects, and
omits the unrelated sample server/setup. CI configuration is unchanged. Existing
PWA/capture cases passed on both viewports (34 scenarios plus setup). Queue cases
cover both themes with zero Axe violations and no horizontal overflow. A browser
page startup exceeded the default fixture timeout under load; the queue suite now
sets its 90-second limit before fixtures run. This is local verification, not full
GitHub CI or physical iOS acceptance.

| Synthetic review evidence | Light | Dark |
| --- | --- | --- |
| Desktop 1440 | [Screenshot](evidence/offline-queue/desktop-light.png) | [Screenshot](evidence/offline-queue/desktop-dark.png) |
| Mobile 390 | [Screenshot](evidence/offline-queue/mobile-light.png) | [Screenshot](evidence/offline-queue/mobile-dark.png) |
