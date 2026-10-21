# Plan category filters — #589

Current synthetic evidence uses source `4d558ef94ae269e845cc18c6a102e52c432412dc`.
Canonical WebKit passed **7/7**: three setup and four feature cases, no skips,
retries or flaky results (80.325s). A fresh E2E build passed; source/Git and all
166 compiled files stayed unchanged during native execution. Owned processes
and containers were cleaned up.

## Current original images

| Profile | Light | Dark | Viewport | Pointer | Before grid |
| --- | --- | --- | --- | --- | --- |
| Desktop-shaped WebKit | [Original](desktop-light.png) | [Original](desktop-dark.png) | 1440 × 900 | Fine | 114px |
| Configured WebKit iPhone | [Original](phone-light.png) | [Original](phone-dark.png) | 390 × 664 | Coarse | 330px |

All four match the current run byte-for-byte; no image replacement was needed.
Desktop search, segments and Optionen share one row with the inspector open;
the measured table offset114px meets the unchanged120px desktop boundary.
This measurement uses the NEW synthetic scene, not a claimed rerun of the old
18-row desktop browser fixture. Separately, the unchanged OLD WebKit compact
case plus setup3 passed4/4 on193f (46.582s), reaching all18 rows/two groups and
its unchanged76px row/group and152px band bounds, cents, keyboard and multi-month assertions. Phone still wraps at44px target height; the desktop120px
bound is not applied to its330px offset. Both desktop-shaped scenes use WebKit.

The header union “2 vorgemerkt / ohne Kategorie” remains distinct from strict
“Ohne Kategorie (1)”. On phone that union chip lies beyond the initial header
horizontal scroll. Phone originals therefore retain earlier image bytes, but
were copied and verified from this current archive; DOM assertions verify the
label/title, not initial phone visibility of the chip.

## Current interactions and focused checks

All four current native cases passed legacy triage→Gruppen and triage→Zeit
navigation, keyboard/selected state, changed-region Axe, search/filter URL
Back/Forward/reload, source links and privacy. The real UI cover action moved
donor10000/recipient−3000 cents to7000/0; its persisted audit group and real Undo
restored10000/−3000, with account96850 unchanged. No mocked financial transport
replaced these writes.

On predecessor193f, NEW RouterUI7, eight unchanged compatibility files/70 tests,
Web types, scoped ESLint/Prettier and CSS scale all passed. Current4d558 scoped
ESLint/Prettier/CSS also passed. New Router cases cover
legacy grouping, view changes, explicit filters, All and stale saved-triage state;
ordinary/time-view row eligibility remains unchanged. Earlier pure3/API3 pass
receipts remain separate, including exact51 IDs/50+1/cursor/no-write assertions.
No existing test, financial writer or formula changed.

## Historical results and pending gates

- The earlier AGE-required full check and normal production build passed on
  `f40e03370d9d2d7613c7be5730c767f281f9b7e2`:589 files/5211 tests, zero failures
  or skips. That was before the compactness/legacy-triage correction; it is **not**
  a required-full result on the current4d558 source.
- First PR744 CI on329d failed real unchanged browser contracts: desktop table
  offset194px exceeded120px; legacy triage grouping/view transitions failed on
  desktop/mobile/WebKit. Those failures remain archived. Current targeted/new
  WebKit success is not an unchanged-OLD-browser or current-green-CI claim.
- CI on4dbab then reported unchanged Sparziele light/dark visual failures. The
  compact rules had matched its shared plan/ptoolbar classes. Current4d558 restricts
  the entire added block to the month-only root, retaining declarations/media and
  leaving all baseline images untouched. Goals visual acceptance needs updated CI;
  this current month-only WebKit run is not a Goals browser proof.
- Corrected exact-head Chromium desktop/mobile and required CI, any further
  required validation/build, serial integration and verified LIVE remain pending.
  An older local run also had four Chromium prelaunch failures from absent
  canonical shell1248; that environment gap does not explain the later CI defects.

Phone scrollWidth is390 with no horizontal document overflow. Individual new
controls passed scroll/reveal, viewport and centre-hit checks; their initial raw
positions follow selection scroll, so not all seven are claimed simultaneously
visible. Full-page phone images include content below fixed navigation and are
not physical-device/whole-page target proof. Existing FAB/month-close overlap
and category-name ellipses remain outside this packet.
