# Manual first-booking regression

This workflow remains available for an on-demand repeat check of the ledger account-check scenario. Run it from **Actions → First booking register regression (manual) → Run workflow** and select the branch to verify.

The workflow still runs `Kontostand prüfen: doppelt, Ausgleich, geprüft sperrt, undo` five times each on desktop and mobile, serially with zero retries. Its financial expectations, locking, override, reconciliation and undo assertions are unchanged.

The automatic branch-protection checks already run the canonical `e2e/ledger.spec.ts` case once in both desktop and mobile. Issue #677 is closed: PR #693 merged the first-booking refetch fix as `0e17fe05`, which is an ancestor of `main` `c436e36f`; both issue acceptance criteria are checked. The repeat run succeeded on PR #782/#611 head `c2552f6a` (run `40369870676`) and PR #785 head `e3bfe983` (run `40422683833`).

This change removes the extra automatic two-job workflow from ledger pull requests while keeping the stress check available on demand. It does not change canonical tests, required status checks or branch protection.
