Cloud handoff checkpoint (2026-10-15): inherited implementation and screenshots below were preserved, then integrated with main 684495d3. Their earlier verification claims have not been rerun on this combined tree. This is WIP, not a delivery claim. Fresh type/unit/browser/CI checks, current screenshots and removal of stale missing-image links are required. Sidebar resize and broader Q5 remain pending.

## Summary

Global search now opens over the current page instead of navigating away. The native dialog keeps the source URL, month, scroll position and focus; phones use the existing full-screen sheet. Actions lead, followed by pages/reports, accounts/categories and bookings. Empty search offers actions and validated session recents instead of the full catalog.

“Alle Ergebnisse” opens `/suche` with the query and source retained. A reload-safe type filter narrows that page. Existing booking, inbox, month-close, privacy and ledger destinations remain in use; no financial calculations or write paths changed.

The existing provider bounds (five matches per data kind within the latest 200 bookings) remain unchanged.

## Validation

- Synthetic component regressions: 58 passed, including overlay opening without navigation, focus return, capture source month and reused search-page parameters. New regressions were observed failing before implementation.
- Focused web typecheck, changed-file ESLint/Prettier, CSS token check and E2E build; final browser results are recorded below before delivery.
- Desktop 1440, Chromium phone 390 and WebKit iPhone checks cover keyboard selection, Escape, focus trapping/return, navigation/actions, loading/error/retry, stale responses, type filtering, light/dark Axe, overflow and 44px phone targets.
- Full `npm run check` and the full E2E suite deliberately omitted under the package's memory limit. CI remains the final gate.

## Evidence and baselines

Screenshots in this directory use only the synthetic sample ledger. No visual snapshot baselines were regenerated. Existing search-page/overlay review screenshots change; there are no committed search snapshot baselines to replace. The header host uses `display: contents` to preserve shell spacing.

The only shared shell additions are the validated `/suche?typ=` parameter and including this search spec in the WebKit project. The existing dialog primitive is reused without modification.

![Desktop, light](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-s1-search-overlay/docs/evidence/search-overlay/overlay-light-desktop.png)

![iPhone, dark](https://raw.githubusercontent.com/Grabman1987/budget/feat/ux-s1-search-overlay/docs/evidence/search-overlay/overlay-dark-webkit-iphone.png)

## Owner steps

Review required CI and try the palette on a physical iPhone and desktop. No keys, consents, migrations, configuration or deployment steps are required by this change. Do not merge until CI and owner acceptance are complete.

Refs #484

🤖 Generated with [Claude Code](https://claude.com/claude-code)
