# Plan category filters — #589

Synthetic evidence from source `376fe26ddc03f75b3c0399ea169b67ee47ec470d`.
The current canonical WebKit run passed **7/7**: three setup cases and four
feature cases, with no skips, retries or flaky results (60.745s). A fresh E2E
build passed; all 166 compiled files and source/Git remained unchanged during
native execution. Owned processes and containers were cleaned up.

## Current original images

| Profile | Light | Dark | Actual viewport | Pointer |
| --- | --- | --- | --- | --- |
| Desktop-shaped WebKit | [Original](desktop-light.png) | [Original](desktop-dark.png) | 1440 × 900 | Fine |
| Configured WebKit iPhone | [Original](phone-light.png) | [Original](phone-dark.png) | 390 × 664 | Coarse |

These four files are byte-identical copies from the current run, without image
editing. The desktop images show the clarified “2 vorgemerkt / ohne Kategorie”
union beside the strict “Ohne Kategorie (1)” filter. The union counts a pending
classified booking and a pending uncategorized booking once each; the strict
filter includes only the latter. Counts, existing popover and financial data
remain unchanged. The union chip lies beyond the initial phone header horizontal
scroll; phone PNGs therefore match prior image bytes. Current DOM assertions
verify the new text/title, not initial phone visibility of that chip.

Desktop search, segments and Optionen share one row with the inspector open.
On phone they wrap without horizontal document overflow (scrollWidth 390).
The seven new phone controls have 44px height and passed individual scroll/reveal,
viewport bounds and centre-hit ownership checks. Their initial recorded positions
follow selection-triggered scrolling, so this is not proof that all seven controls
fit simultaneously in the visible viewport. Full-page phone PNGs include content
below the fixed navigation; this is configured browser evidence, not a physical
device or whole-page touch-target certification.

## Interaction and financial evidence

All four current feature cases passed keyboard/menu and selected-state checks,
changed-region Axe, search/filter URL navigation, Back/Forward/reload, actual
source-booking links and privacy. The real existing UI cover action moved donor
10000/recipient−3000 cents to 7000/0. Its persisted audit group and real Undo
restored 10000/−3000, while the account remained 96850 cents. No synthetic success
transport replaced these financial writes.

Separate focused runs passed NEW pure 3, real API 3 and current Router UI 5, including
exact 51 booking IDs, 50+1 paging, cursor refusal, read-only state conservation and
the literal 52 union versus 51 strict count/dedup case. Eight unchanged compatibility
files / 70 tests passed. DB/server/Web types and scoped lint/format/CSS checks passed;
latest label-related static/UI checks ran on the current source. Existing tests,
financial writers and formulas are unchanged.

## Limits and remaining gates

- Chromium desktop/mobile acceptance is **pending required exact-head CI**. The
  earlier local combined run had seven passes and four Chromium failures before
  launch because canonical headless shell1248 was absent; no Chromium product
  assertion ran. Both desktop-shaped images here still use WebKit.
- Required AGE-enabled full check and normal production build are pending on the
  final source/evidence checkpoint; this README makes no full-green claim.
- Exact-head required CI, serial integration and verified LIVE remain pending.
- The existing phone floating plus partly overlaps Monat abschließen; existing
  category-name ellipses and fixed-navigation full-page screenshot behavior are
  outside this filter packet and do not certify those controls.

The initial invalid contact/transfer API fixture, first custom-input label lint
failure and earlier unclarified-header images remain historical receipts. They
are not counted as extra successful tests or substituted for these current images.
