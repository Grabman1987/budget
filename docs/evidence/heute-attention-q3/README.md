# Today attention — UX Q3 (#466)

One nonempty **Zu tun** section replaces the per-account reminders and separate next steps. Its four source rows are ordered Plan, rule findings, inbox/bookings and account checks. Account review links to the existing inbox account reminders; month close shares the Plan row. Savings execution proposals already belong to the inbox count, so no second proposal list is rendered.

**Fällig 14 Tage** combines recurring payments and planned one-off events through day 14 and disappears when empty. The underlying 35-day event read model and every write, lock and undo path stay unchanged. Finanz-Check shows counts, missing-input explanations and source links in a compact tile. Funding notes disappear when there are no open goals or errors.

Decision 3B retains month navigation and Monat / Bis Gehalt. Other months use a short Ansicht / return line. Current-only answer cards, task sources, finance check, wealth, bookings and funding notes say **Stand heute**; Pace and pinned envelopes continue to follow the selected month.

Local verification follows the owner's package memory exception: no full check, no full E2E suite and no snapshot regeneration. The focused component regressions passed **4 files / 16 tests**, after reproducing the missing behavior. Changed-file ESLint/Prettier and the CSS scale check passed. The E2E build passed, followed by a web-only rebuild after the final funding empty-state change. Existing bundle-size and dependency annotation warnings remain.

The normal Playwright bootstrap and the one-server retry both failed before tests at `tsx` → `os.userInfo` → `ENOMEM`. The final local retry bundles the unchanged synthetic seeder with existing esbuild, sets the existing `BUDGET_MIGRATIONS_DIR` override and uses one sample server with one worker. The temporary config and bundle are not delivery files.

The six new functional browser scenarios passed across focused runs: populated/current/other-month flow and empty/missing-input flow on desktop 1440 × 900, Chromium mobile 390 × 844 and WebKit iPhone 390 × 844. Current and other-month main content passed light/dark Axe with no violations. Source links, cancellation, month return, 44px changed-section targets and no horizontal page overflow were asserted. The final desktop run passed both scenarios plus setup after increasing two existing income-skip buttons from 34px to 44px. The short initial loading assertions and one WebKit Axe timeout were retried only in this spec with a longer deadline and viewport screenshots.

Web typecheck remains unverified locally: the normal run stalled under host load, and retries with 512 MiB and 1024 MiB heaps exhausted the heap. No typecheck pass is claimed; required CI must supply that gate. No full local check or full E2E suite was run.

Synthetic screenshots: [desktop light](desktop-light.png), [desktop dark](desktop-dark.png), [Chromium mobile light](mobile-light.png), [Chromium mobile dark](mobile-dark.png), [iPhone light](webkit-iphone-light.png), [iPhone dark](webkit-iphone-dark.png). Phone screenshots show the attention block after scrolling; no real financial data is used. CI and physical desktop/phone owner acceptance remain required.

Affected visual baselines (review in pinned Linux CI; not regenerated locally): `e2e/shell.spec.ts-snapshots/shell-heute-{light,dark}-{desktop,mobile}-linux.png`.

Delivery block: two normal staging/commit attempts failed while creating `.git/worktrees/budget-ux-q3/index.lock` with `Permission denied`. The changes and prepared English [PR body](PR.md) remain uncommitted in the worktree; push and PR creation depend on a successful normal commit. The worktree is therefore not clean.
