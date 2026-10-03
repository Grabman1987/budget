# Report correctness: review evidence

Synthetic fixtures only, Chromium on Windows. Desktop is 1440 × 900; mobile is
390 × 844. These are review captures, not replacements for pinned Linux baselines.

| View | Desktop | Mobile |
| --- | --- | --- |
| Heute: shared R07 forecast and mobile safe space | [Light](heute-desktop-light.png) | [Dark](heute-mobile-dark.png) |
| Project settings: bounded, horizontally scrollable table | [Light](projects-desktop-light.png) | [Dark](projects-mobile-dark.png) |

The affected browser specs also check both themes, Axe violations, financial figures,
calendar ranges, unreliable forecast suppression, absolute deviations and document overflow.
The mobile safe-space case requires the attention box to be visible above the capture button,
then checks that the last booking remains above the button when scrolled to the page end.

Local verification uses two Vitest workers and 30-second test/hook timeouts. The browser
run uses the unchanged repository config with a temporary ignored wrapper: one worker,
120-second tests and 15-second assertions. No CI or repository settings were changed.
Final outcomes are recorded in the task delivery and PR text.

See [calculation definitions](../../report-correctness.md). Owner acceptance with private
source data and on actual devices, plus green Linux CI before merging, remains open.
