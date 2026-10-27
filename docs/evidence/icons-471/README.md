# Icon consistency: synthetic browser evidence

These unchanged viewport PNGs come from canonical Linux browser run [40412320374](https://github.com/Grabman1987/budget/actions/runs/40412320374), checked-out code `85adcf80f1b706f0e67892c14dc3b01821b89145`. Eleven selected cases passed in 42.1 seconds of test time, without failures, retries, skips or screenshot baseline changes. The selection included the new icon/disclosure/capture cases and the existing pending/confirmed booking write-path case on their configured profiles and setup dependencies.

- [Desktop, light](desktop-light.png): Chromium at 1440 CSS pixels; the status label and icon fit inside their button beside the account field.
- [WebKit iPhone, dark](webkit-iphone-dark.png): 390 CSS pixels, browser emulation; the full status control remains inside the dialog and viewport. This is not a physical-device test.

Both images use seeded synthetic sample data. The originals were visually inspected after the earlier passing run exposed clipped status text. The corrected account-row sizing and inline flex control are also covered by rectangle-containment assertions in both pending and confirmed states, with the original native clicks and write-path expectations retained. Plan/year/portfolio icon sizes, class abbreviations, disclosure states and light/dark accessibility checks are part of the same scoped test run.

Required full exact-head PR CI, intended baseline review and publication are separate delivery gates and remain pending at this checkpoint.
