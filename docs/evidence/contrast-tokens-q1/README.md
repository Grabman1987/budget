# UX Q1: contrast tokens (#464)

DESIGN.md remains the source for generated tokens. Field/segment boundaries and meaningful secondary lines now reach 3:1 against every normal surface. Small metadata uses darker light ink, while dark positive fills use a lighter green and dark foreground. Dark primary buttons use the owner's proposed cyan. The later DS1 teal/orange palette remains a separate package.

Tinted hover/selected rows and selected controls inherit ink-2 for metadata normally using ink-3. Source RGB, linear-light luminance and alpha-composited tint tests verify light, system-dark, forced-dark and print. Browser checks also read the minified tokens and actual row metadata.

Verification: 29 token/contrast unit tests passed, including local positive-hero alpha remapping. Six light/dark scenarios passed on desktop 1440, Chromium mobile 390 and WebKit iPhone 390 (9 tests including setup): Today and booking-dialog Axe clean, no horizontal page overflow, form targets at least 44px on phones, and metadata correctly inherits stronger ink. E2E build passed. Full repository check and required PR CI are recorded separately when complete.

Synthetic evidence: [desktop light](desktop-light-capture.png), [desktop dark](desktop-dark-capture.png), [iPhone light](webkit-iphone-light-capture.png), [iPhone dark](webkit-iphone-dark-capture.png). The adjacent Today screenshots cover the positive fills. No financial data, write path, migration or dependency is changed. Linux baselines are generated only by the existing CI workflow.
