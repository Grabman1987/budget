# Offline last state (#558)

The four approved views retain their last successful primary response in device IndexedDB: Heute, unfiltered account balances, the current-month Plan and the latest default bookings page. The offline surface displays the saved values and each response's `Stand vom` timestamp, including native currencies and explicit unavailable valuations. It does not recalculate replacements or combine dependent live queries. Other pages retain the offline notice. Live forms remain mounted but hidden and inert during an in-session disconnect so drafts survive. Only the existing queued booking capture remains writable offline.

A nonfinancial positive read permission must match the store epoch. Known authenticated status grants it only after an atomic old-data clear; a failed quota-limited grant leaves no permission. Sign-out, ordinary authenticated API 401, and HTTP 200 auth status with `authenticated:false` synchronously revoke access. Every cross-tab subscriber receives the revocation, including an already visible offline view. Request generation and the IndexedDB epoch fence older in-flight reads. A blocked pre-read has a 500 ms latency bound; the existing three-second physical-clear timeout and queue behavior remain unchanged. Failed or blocked deletion is reported honestly: unreadable data is not claimed physically removed.

## Review and evidence

Independent complete security review cleared the repaired source at `6c214eb5`; subsequent formatting-only and test-setup corrections received independent delta reviews. Integration of main `3a5c7ddf` into this branch changed none of the twelve feature-file blobs from `cb28bc35`.

The initial scoped run [40438362707](https://github.com/Grabman1987/budget/actions/runs/40438362707) on `67408dac` passed 15 of 27 cases and exposed test setup faults. The corrected focused run [40441364648](https://github.com/Grabman1987/budget/actions/runs/40441364648) checked out `cb28bc35` and passed all 18 selected cases (three setup cases and five scenarios across desktop, Chromium mobile and WebKit; 1.4 minutes). These cover the four literal saved values and read-only reload, failed deletion with retained raw rows but revoked access, an actually triggered quota failure during permission grant, a real mounted-view 401, and known signed-out status on the login page. Light/dark Axe, 390 px overflow, phone target checks and per-view PNGs are included. The artifact contains all four views in both themes and all three profiles. These are browser emulations, not physical-device tests.

The other four security scenarios passed on the earlier source: server logout failure, a read held across another tab's sign-out, delayed native database open, and immediate disappearance from an already visible offline tab. Their full execution on the final integrated PR head, static/unit checks, publication and fresh live verification remain required. No complete-feature or live claim is made by the focused result.

## Test changes

- `apps/web/src/pwa/pwa.test.tsx` finds the preserved draft input inside the intentionally hidden live wrapper; its existing value assertion remains.
- `apps/web/src/pwa/local-data.test.ts` mocks the additional snapshot store and asserts revocation/clear calls while retaining the existing queue and timeout assertions.
- New unit cases cover the exact URL allowlist and offline write guard with the existing queued capture exception.
- The new browser spec uses independently stated literal cents, waits for completed saved reads before navigation, and prevents inspection helpers from creating a malformed empty database. Fault tests assert that their actual storage or auth failure branch was reached. Failed-clear and quota-grant coverage are separate cases. No existing financial, locking, Undo, timeout, retry or skip expectation is weakened.
