# UX-2b — cover limits (2026-10-05)

Synthetic evidence only; no private data, provider calls, migrations or deployment.

- One pure cover-availability calculation protects future pending category outflows and unbooked recurring dues through the existing inclusive `nextPayday` boundary. Live occurrence links prevent a second reservation; missed occurrences do not reserve money.
- The requested reservation is subtracted from the existing Available figure; Available and the ledger are not rewritten. Individual and bulk cover recompute free money on the server inside the existing transaction/audit group.
- The old public `allowNegative: true` cover override is rejected; the UI offers only a capped partial cover. Repository-only overrides remain for existing synthetic reconciliation tests.
- Budget account details use today's signed balances and stored credit/overdraft lines. An unused credit line never increases money.
- The next-month option navigates to the following Plan month using the existing cash/card overspending rules, retaining category rollover settings. It creates no booking or transfer.

Browser checks: the new limits flow, existing bulk cover/undo and negative-assignment/partial-cover flow passed on desktop 1440 and mobile 390. The full Plan spec passed on both viewports after its old source-label selector was updated. The new flow passed light/dark Axe and overflow assertions. These are evidence captures, not visual comparison baselines; no baseline was regenerated.

[Desktop, light](desktop-light.png) · [Mobile, light](mobile-light.png)

Local verification: full typecheck and ESLint passed; the once-run check stopped on two formatting issues, then the corrected files passed Prettier. The full unit run reported 334 passing files and two failing files (3,173/3,180 tests); after correcting LF line endings in DESIGN.md and the on-budget reserve-account filter, the two affected files passed all 14 tests. Production build passed. The focused browser selection passed nine cases, and the corrected Plan spec passed nine cases (including setup projects). CI/Linux visual comparison and owner acceptance remain open. No new keys or consents are needed.

Delivery is blocked locally: Git could not create the worktree index lock (`Permission denied`); no existing lock was present. No commit, push or PR was created. The ignored `test-results/ux-cover-handoff.md` and `test-results/ux-cover-pr.md` contain the prepared delivery commands and German PR body.
