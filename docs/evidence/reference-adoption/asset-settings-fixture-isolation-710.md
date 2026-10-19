# Asset-settings fixture isolation for #698 / PR #710

Exact-head CI `39291685795` failed only the existing mobile asset-class owner flow
and its aggregate. The first attempt had already created its class and account
with 201 responses before `page.reload()` returned `net::ERR_ABORTED`. Its configured
retry reused the same project-only class name and therefore received 409 where the
original assertion correctly requires 201. No receipt-upload failure was observed.

The group-rename save completes asynchronously: pending-save protection and later
panel-close navigation can overlap an immediate reload. The historical trace is
unavailable, so the exact cause of that navigation abort remains unproven. The
coordinator adds stronger completion checks after the rename: no open dialog and
the exact panel-free asset-settings URL. The original reload is retained.

The existing `again(info)` helper adds the configured retry/repeat suffix to this
scenario's fixture names. The initial attempt's names are unchanged. A controlled
actual API case in the same synthetic database returned 201 for the first class,
409 for its duplicate, and 201 for the distinct retry-suffixed class, with exactly
one record for each successful name.

A separate actual WebKit run executed the complete original owner flow with only
the coordinator's import, suffix and two completion assertions changed. It passed
in 13.52s, retaining the original class/account 201 checks, 101-cent P2P input,
persisted assigned class, original reload, both legend assertions (report returned
200), both-theme overflow/title checks and Axe assertions. Both actual images were
opened and show the intended group, class and 1.01-euro synthetic position.
No failed document request was observed in this bounded run; that observation is
not a reproduction or proof of the historical abort's precise timing.

The complete run passed 5/5 cases in 29.12s (three setup, the unchanged owner flow
plus stronger isolation, and the real duplicate/retry-name control), without skips
or flakes. Fresh E2E build and runner exited 0. All eight original API/migration
candidate files and the coordinator's existing test hash remained unchanged;
temporary diagnostic tests were removed. Canonical Chromium and the final exact
PR head remain CI gates, rather than claims from this WebKit proof.

Whole-file inverse removes exactly the added helper import, suffix and two new
assertions, restoring SHA256
`f48d04b5c9bc99906535f6fbee5219e56868eb88f6d76b536831196c87160fbc`.
The changed file is
`767e2c7ebed0bcbc8d2913f2d77fc8e3147a677a813c42261b3185fdb2173d2c`.
Every other whole-file byte is identical. The existing 90-second budget, configured
retries, all prior actions/assertions, financial values and P2P rules are unchanged;
no navigation retries or forced clicks are introduced.

The coordinator owns this existing-test edit under the owner's 2026-10-17
stricter-isolation policy. The PR provides per-file justification, independent
whole-diff review and `tests-change-approved`. Independent Codex reviews and serial
CI/deployment/live integration are authorized in #694. #698 closes only after all
its acceptance criteria and live delivery are verified; parent #559 stays open.
