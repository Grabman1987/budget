# Compact report header: first slice of #1150

Synthetic sample-ledger evidence from `e2e/issue-1150-report-header.spec.ts`, with
the redesign ON. Chromium viewports are 1440 × 900 and 390 × 844; these are browser
emulations, not physical-device acceptance. The spec also exercises WebKit.

| Viewport | Theme | Header | Open menu |
| --- | --- | --- | --- |
| Desktop | Light | [Header](desktop-report-header-light.png) | [Menu](desktop-report-menu-light.png) |
| Desktop | Dark | [Header](desktop-report-header-dark.png) | [Menu](desktop-report-menu-dark.png) |
| Phone | Light | [Header](mobile-report-header-light.png) | [Menu](mobile-report-menu-light.png) |
| Phone | Dark | [Header](mobile-report-header-dark.png) | [Menu](mobile-report-menu-dark.png) |

These are review evidence, not screenshot baselines. Other report-family view
controls and owner live acceptance remain open, as recorded in the Reports stories.

The final capture used a temporary sample-server-only local runner with the same
browser profiles, assertions and timeouts. Its Chromium captures completed; the
job was not fully green because of reader-loading and WebKit Axe timeouts under
host memory pressure. The earlier standard header run passed all profiles.
Required CI remains the browser verification gate.
