# Reconciliation fixture isolation for #627 / PR #709

The final CSV candidate's CI `39289197927` failed only the existing desktop
reconciliation scenario in `e2e/ledger.spec.ts:217` and its required aggregate.
The first attempt saved but could not find `Laden desktop` in the current account;
the retry later could not find the pending-status button. Neither observation
establishes an export or financial-calculation regression.

The exact CI shard discovery places both `issue-672-toast-dialog.spec.ts` and this
ledger scenario in shard 3, sharing its synthetic server database. Both fixtures
use the same payee name. Choosing an existing payee intentionally selects its last
account, so project/retry suffixes alone do not isolate these scenarios.

A controlled actual WebKit run seeded a previous Giro booking for that payee,
opened a new target account, and exercised the actual form. Payee blur selected
the previous account; the real POST returned 201 with that account, `-2000` cents
and confirmed status. The target retained zero rows and its literal `50000`-cent
balance, while the previous account gained the new row and lost 2000 cents.
This reproduces successful saving followed by a missing row in the target account.
A separate cash-account control reproduced automatic confirmed status, but the
historical retry's precise cause remains unproven because its CI trace is not
available. These controls use synthetic local data and add no authentication proof.

The coordinator changes exactly one existing fixture declaration: prefix its
project/retry tag with `Kontostand`. Every other byte of the whole existing file
is unchanged. In particular, all monetary expectations, duplicate removal,
reconciliation, checked-entry locking, explicit release, compensation and undo
assertions, actions, timeouts and retries remain intact. Both deliberate duplicate
bookings still share the same payee within this isolated scenario.

The complete original scenario with only that namespace change passed in 10.36s.
The actual run passed all five cases (three setup, the controlled reproduction and
the full scenario) in 37.88s, without skips or flakes. This is actual WebKit
evidence; canonical desktop Chromium remains an exact-head CI requirement.
The fresh E2E build and runner both exited 0, and all 17 original CSV candidate
files remained unchanged before and after the run. Temporary diagnostic tests were
removed; they are not additional committed tests.

The exact inverse restores whole-file SHA256
`64a215371dd47458c955a0ea648df18163a8a13567306d8ee810e954c8c2d19c`;
the changed file is
`3ee18116f51c4764f58a18656c2c3b988fa47b296a0364c451b18e0f23afff5b`.

Authority: the owner's 2026-10-17 test-change policy permits stricter isolation
with per-file justification and independent review, preserving financial,
security, locking and undo coverage. The owner authorized independent Codex
whole-diff review and serial CI/deployment/live integration in #694. The PR must
include that justification and the coordinator's `tests-change-approved` label.
Final review, exact-head CI and live delivery are required before #627 closes.
