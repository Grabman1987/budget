# Command palette / month close CI repair — 2026-10-07

PR #249 replaces the old month-close link in the search popup with a selectable
command. CI run 37584003679 fails in `e2e/month-close.spec.ts` on both desktop and
phone because the test still waits for that removed link.

The repair selects the month-close option in the existing search results list.
The test still checks that the previously saved wizard resumes at step 4. Its
earlier state, booking-count and month-entry assertions remain in place.

Validation against `3995d2c1a6b1aa533a34f53658a5bc80cd22a780`:

- All workspace typechecks, CSS scale, ESLint and Prettier pass.
- 3,437 unit tests in 372 files pass, with two workers and `BUDGET_REQUIRE_AGE=1`.
- Production and E2E builds pass.
- Search and month-close E2E: 18 passed, one desktop-only mobile-header case
  skipped; desktop and phone both resume the existing wizard correctly.

A temporary runner uses `node --import tsx` for synthetic sample seeding because
the CLI Unix socket is unavailable here. All configured servers and fixtures
remain enabled; no assertions, retries or timeouts are relaxed.

This repair targets the palette branch. Required GitHub CI and the owner's
device/visual acceptance remain merge gates.
