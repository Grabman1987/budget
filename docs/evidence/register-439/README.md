# Register delivery — #439

Only synthetic ledgers were used. No provider calls, private data, migration, new dependency,
deployment or baseline regeneration is part of this package.

## Findings and changes

- The account register explicitly filtered to the current month. It now loads the whole account
  history, newest first, through the existing cursor API. Its month movement remains a separate,
  bounded one-row query. All Bookings already searched/filtered on the server across the whole
  ledger; both lists now load older pages with IntersectionObserver and retain a keyboard/touch
  load button. Automatic retries stop on errors.
- The original correlated running-balance SUM was evaluated before the page limit. The new
  10,000-booking traversal exceeded its 30-second timeout (86 seconds observed) before the fix.
  One chronological pass now preserves opening-date rules, same-day ID ordering and unfiltered
  balances even when the displayed rows are filtered. This remains an O(n) account scan per page,
  not a claim of constant-time database reads. Existing money, FX, transfer and audit paths stay
  shared.
- Mutation settlement returned a promise for all active ledger/budget/expected refetches, keeping
  the capture dialog waiting after the write had succeeded. It now starts those reads in the
  background. Cursor lists restart from page one after a mutation/undo, avoiding refetching every
  older page. Inactive wealth queries remain stale until revisited; visible wealth queries still
  refresh. The register's network checks see no wealth endpoint calls. The existing invalidation
  already avoided inactive wealth refetches; there was no proven need to change that policy.
- Weekly and monthly credit-card repetition already works in this base. Real dialog E2E creates
  each schedule and checks its account, category, next date and signed amount, then verifies the
  payment in Plan and Heute. No speculative recurring implementation change was made. Existing
  API tests retain combined booking/schedule undo, idempotency, rollback and reconciled locks.

## Measurements

`Server-Timing: booking;dur=<milliseconds>` covers the POST/PATCH booking route, including body
validation, transaction, audit and response readback. It contains duration only, no ledger data.

| Synthetic 10,000-booking fixture | Server | In-process request |
| --- | ---: | ---: |
| POST (initial measured run under load) | 48.5 ms | 107.9 ms |
| PATCH (initial measured run under load) | 31.8 ms | 32.7 ms |
| POST (final affected unit run) | 21.7 ms | 23.3 ms |
| PATCH (final affected unit run) | 20.6 ms | 21.2 ms |

The regression asserts each POST/PATCH server duration is below 500 ms. Browser measurements
start before clicking Save and include Playwright action scheduling and the existing dialog exit
animation; they are not bare server latency. The spec logs POST/PATCH response time, dialog-hidden
time and GET paths and attaches timing JSON for CI. The controlled client regression blocks reads
and proves that the saved mutation still resolves; it also protects active financial figures and
the single-page cursor restart.

| Final desktop dialog run | Server | Click to response | Click to hidden dialog |
| --- | ---: | ---: | ---: |
| Weekly POST | 69.9 ms | 268.7 ms | 705.1 ms |
| Monthly POST | 22.3 ms | 175.3 ms | 593.7 ms |
| Weekly PATCH | 15.9 ms | 298.6 ms | 710.8 ms |
| Monthly PATCH | 18.8 ms | 342.7 ms | 755.7 ms |
| Weekly POST (390 px) | 47.8 ms | 327.8 ms | 1259.2 ms |
| Monthly POST (390 px) | 41.8 ms | 191.7 ms | 608.7 ms |
| Weekly PATCH (390 px) | 16.2 ms | 300.6 ms | 704.3 ms |
| Monthly PATCH (390 px) | 27.5 ms | 334.1 ms | 754.1 ms |

These card-dialog fixtures are deliberately small; the 10,000-row timing guard is the server
test above. Register refreshes include account figures, series, the first history page, the
separate month metric, payees and the affected budget months. POST/PATCH do not trigger a wealth
endpoint from this page.

## Verification

- Touched package typechecks: web, server and DB, exit 0.
- Changed-file ESLint, Prettier and `git diff --check`: exit 0.
- Eight affected Vitest files: **83 passed**. The tests cover cursor traversal over five months,
  5,000 filtered rows out of 10,000, literal balances, safe save settlement, existing cache and
  booking models, repeating writes and rollback/undo.
- One `npm run build:e2e` passed. A final cache review required a web-only rebuild; the server
  bundle remained unchanged. Existing Zod annotation/dynamic-import warnings are build warnings.
- The new `e2e/register.spec.ts` alone covers account/all history over six months, oldest-row
  search, month totals, balances, credit-card weekly/monthly capture, subsequent PATCH, Plan/Heute,
  overflow, the mobile load button's 44 px targets and light/dark Axe checks. Final desktop:
  **6 passed (3 scenarios + 3 setup), 51.3 seconds**. Final mobile:
  **6 passed (3 scenarios + 3 setup), 46.1 seconds**.
- No full check or full E2E suite was run, per the package's parallel-job memory override.
  Required CI is the final gate.

No existing visual baselines directly cover the changed register lists, and recurring layout is
unchanged. No baseline update is proposed; existing expected-payment/net-worth/Heute baselines
remain CI review surfaces. The screenshots beside this file are synthetic review evidence.

## Delivery blocker

The authorized `git add` and `git commit` both failed because Git could not create the worktree
`index.lock` (`Permission denied`). No task commit exists, so pushing an unchanged base or opening
an empty PR would not deliver this package. No alternate index, checkout, permission change or
GitHub write was used to bypass the restriction. The index remains unchanged; the implementation,
tests, screenshots, roadmap entry and ready PR body remain uncommitted in this worktree. A clean
worktree cannot be achieved while retaining this work until the normal Git write is permitted.

## Owner steps

Commit the prepared files from a session allowed to write the normal Git index, push
`feat/register-infinite-save-speed` and open the normal PR using [PR.md](PR.md). After required CI
and integration, review older history and capture weekly/monthly card payments
on desktop and a physical 390 px phone. Confirm the next occurrence and account/category in Plan
and Heute. Loading older pages after a save starts again at the newest page. No keys, consents,
database migration or provider setup are needed. This package does not merge or deploy.
