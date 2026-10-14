Today's repeated account-check rows pushed useful forecasts below routine work. This change groups work into at most four source rows in a nonempty **Zu tun** block, reuses the existing account/inbox/rule/Plan actions, merges recurring and one-off dues into one nonempty **Fällig 14 Tage** list and summarizes Finanz-Check in a tile.

Decision 3B keeps month navigation and Monat / Bis Gehalt. Other-month views use a short return line and explicitly label current-only information **Stand heute**. Pace and pinned envelopes retain their selected-month scope. Calculations, integer-cent amounts, write paths, locks and undo remain unchanged; there is no migration or dependency change.

Validation: 4 affected Vitest files / 16 tests passed, including red/green regression evidence. Changed-file ESLint/Prettier, CSS scale and the E2E build passed. Six new functional scenarios passed across desktop 1440, Chromium mobile 390 and WebKit iPhone 390, including current/other-month light/dark Axe (no violations), 44px targets, overflow, source navigation and empty states. The final desktop run passed both scenarios plus setup after correcting two 34px income-skip buttons. Existing financial tests were retained; no snapshot baseline was regenerated.

Web typecheck is still a required CI gate: the local standard run stalled under load, and 512/1024 MiB retries exhausted the heap. No typecheck pass is claimed. The owner's package memory exception applies: no full local check or full E2E suite. [Delivery notes](https://github.com/Grabman1987/budget/blob/feat/ux-q3-heute-attention/docs/evidence/heute-attention-q3/README.md) record the synthetic seeder/bootstrap retries. Review the four `shell-heute-{light,dark}-{desktop,mobile}-linux.png` baselines in pinned Linux CI.

![Desktop light](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q3-heute-attention/docs/evidence/heute-attention-q3/desktop-light.png)

![iPhone dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-q3-heute-attention/docs/evidence/heute-attention-q3/webkit-iphone-dark.png)

Owner steps: review the deployed desktop/phone flow after required CI and baseline review pass. No keys, consents or configuration changes are needed. Do not merge until required CI and owner acceptance are complete.

Refs #466

🤖 Generated with [Claude Code](https://claude.com/claude-code)
