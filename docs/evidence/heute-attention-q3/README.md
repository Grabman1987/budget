# Today attention — UX Q3 (#466)

One nonempty **Zu tun** section groups work into at most four source rows: Plan, rule findings, inbox/bookings and account checks. Account review opens the existing inbox reminders; month close shares the Plan row. Savings proposals retain their amounts, account, date and execution-review action inside a collapsed disclosure in the inbox row. Loading failures remain visible there. Confirmation, locks and undo use the existing workflows.

**Fällig 14 Tage** combines recurring payments and planned one-off events through day 14 and disappears when empty. Multiple weekly occurrences remain separate dated rows. Finanz-Check keeps counts, missing-input explanations and source links in a compact tile. Empty funding notes disappear.

Decision 3B retains month navigation and Monat / Bis Gehalt. Other months use a short Ansicht / return line. Current-only information is labelled **Stand heute**; Pace and pinned envelopes continue to follow the selected month.

## Verification

- Web typecheck, changed-file ESLint, Prettier, CSS scale and E2E build passed.
- Focused component tests: **4 files / 17 tests passed**. Savings-only and failed-query states keep the review source visible.
- Existing savings-execution E2E reproduced the removed action before repair. The action now lives in Zu tun; the original amount, holdings, cash, confirmation, cancellation, undo and redo assertions remain.
- Targeted desktop/mobile regressions: **19 passed**, including setup. Coverage includes live Today amounts and sources, missing-quote valuation and undo, matching overspending counts, savings execution, weekly/monthly payment creation and edit, full-width detail navigation and both-theme Axe. Weekly dues assert both 05.10. and 12.10. in the combined list.
- Both grouped-work scenarios passed on desktop 1440, Chromium mobile 390 and WebKit iPhone 390. Main-content Axe is clean in light/dark, changed touch targets are at least 44px, there is no horizontal page overflow, review navigation and cancellation work, and empty lists disappear.
- Local runs use `NODE_OPTIONS=--max-old-space-size=1536`, `E2E_PORT=5070`, `E2E_LEDGER_PORT_OFFSET=100` and one worker. No Linux screenshot baseline is generated locally. Required PR CI and the snapshot workflow verify the final pushed tree.

Synthetic screenshots: [desktop light](desktop-light.png), [desktop dark](desktop-dark.png), [Chromium mobile light](mobile-light.png), [Chromium mobile dark](mobile-dark.png), [iPhone light](webkit-iphone-light.png), [iPhone dark](webkit-iphone-dark.png). Phone screenshots show the task block after scrolling. Physical-device owner acceptance remains separate from automated checks.

Affected visual baselines: `e2e/shell.spec.ts-snapshots/shell-heute-{light,dark}-{desktop,mobile}-linux.png`.
