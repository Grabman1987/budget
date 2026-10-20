# #481 follow-up — separate multi-category headings

Owner [decision of 20 October](https://github.com/Grabman1987/budget/issues/481#issuecomment-6285882335): **“Klare Trennung priorisieren; 44 Zeilen / 20 % akzeptieren”.**

Every multi-category group has its own heading before all its category rows, including the first. That heading retains group totals, selection, collapse and inline+. It contains no first-category inspector or assignment control. Single-category decision 7A bands remain. The initial layout change is one `band = singleBand` predicate. A later desktop selection correction also includes standalone `.pgroup` headings in the existing inside-selection boundary. CSS, cent calculations, write/lock/Undo and #590 gesture handlers are unchanged.

The independent synthetic sample retains **36 category rows + 8 separate multi-category headings = 44 logical content rows**, 11 single-category bands and 19 group contexts. Against 55 baseline rows this is exactly 20% fewer; 18 decorative gaps are excluded. The 20 October decision supersedes the 19 October fused 36-row extension. Original #481 images/JSON remain historical and untouched.

## Original local verification checkpoint

- NEW RTL: **5/5 pass**. Independent parent 4509/−1405/3104 versus first 501/−703/−202 cents, no parent-to-first inspector action, persistent collapse/native focus, 1→2 category identity, phone group/category/all mixed selection, exit and creation-form opening with no financial writes. This run precedes independently verified formatting-only changes to the NEW files.
- Current Web types, scoped TypeScript lint/format and official collection pass. The initial five baseline failures remain archived: three direct hierarchy REDs, a stale fused-toggle reference and a NEW ambiguous exit locator. The exit now uses the existing selection region. No timeout or monetary expectation was weakened.
- **Fresh E2E build 0; genuine canonical WebKit 29/29 pass (5.3m)**: 3 setup + 26 feature cases, including all 7 NEW cases and four coordinator-adapted existing specs. Runtime is trusted Main 208cf9d1 plus nine reviewed working changes, pinned by freeze 34cbc6a8. All 3479 working source paths/permissions, index, HEAD/status and 168 freshly compiled files remain exact. Source, process, archive, wrapper and lock guards exit 0. No tracked historical image was regenerated. The raw cleanup records one exited esbuild zombie; no owned live job remained.
- Native exact identity/payload assertions reach first 601 and second 4008 cents, parent 4609, then real Undo to the full original budget. Existing #590 4000/6000→Undo 0/0/TBA 10000, trusted gesture identity/release/cancel/movement and final no-write/budget/account guards pass.

[Six-profile proof](profiles.json) contains compact measured bounds, actual profiles and exact raw-file/source hashes. The full archive stays outside the repository. Separate current DOM table measurements are 1883 CSS px at 1440×900 and 3807.125 CSS px at configured 390×664; they do not establish a 20% physical-height reduction.

## Original captures from the 29-case checkpoint

| Profile | Light | Dark |
|---|---|---|
| True 1440×900, DPR1 | [original](desktop-light.png) | [original](desktop-dark.png) |
| Manual 390×844, DPR3 | [original](phone-light.png) | [original](phone-dark.png) |

Root and the independent reviewer personally opened all four originals and checked the six raw profiles. Parent/ordinary-category/pair height maxima are 30/33/63 CSS px on desktop and 71.390625/75/146.390625 CSS px on phone, within unchanged 36/40/76 and 76/76/152 budgets. Phone targets retain 44×44px; original smaller desktop controls remain.

These byte-exact full-page captures are not image-match baselines. Desktop Miete keeps its keyboard focus outline; ordinary names/status can ellipsize. Fixed phone NAV/FAB cover part of Strom/Internet near the initial 844 CSS px viewport. This is not a wholly unobscured-page or per-point hit-test proof. Phone originals are 1170×15153 physical pixels at DPR3; Root's client preview was downscaled without changing their bytes. WebKit reports rawTouchPoints 0 despite coarse profiles. The pinned-protocol gesture proof establishes no physical-phone, OS-pan or accepted native compatibility-click behavior.

## Coordinator-owned existing-file authority

The explicit owner 44/20 decision and [queue UI test-change policy](../../queue/README.md) govern these coordinator-authored adaptations. They received independent whole-diff review. The implementer did not edit an existing test.

| Existing file | Equivalent UI adaptation | Preserved constraints |
|---|---|---|
| `issue-481-single-category-band.spec.ts` | Eight separate parent/first-child pairs, 44/20 count, actual header labels/conditional ellipsis; artifacts use outputPath. | 36 categories, 11 singles, 19 contexts; all assignment/move/cover payloads and original € display literals 100,30/−100,09/0,21/100,01/−0,01, Undo, keyboard, privacy, contrast/Axe, 44px and original caps/timeouts. |
| `plan-compact-grid.spec.ts` | 18 whole category hulls + 2 parent hulls and ordered pairs. | Parent 4509/−1405/3104 versus child 501/−703/−202; 18↔9↔0 membership, all actions/Undo, 36/40/76 desktop and 76/76/152 phone caps, beforeGrid 120, minimum 14 visible, 90s. |
| `issue-588-plan-menus.spec.ts` | Eight stable expanded/collapsed headings; 25 ordinary children, 11 single bands, 36→11→36 categories. | All menus, keyboard, month-span and phone checks, ordered first-child visibility and exact membership. |
| `issue-590-phone-selection.spec.ts` | Geometry helper uses real separate parent/child rows. | Entire following selection/contact/financial source unchanged, including exact 4000/6000 and Undo, trusted identity/cancel/move/no-write checks and default timing. |

DESIGN/PRODUCT were reconciled by the coordinator. Existing financial oracles, original limits and single-category 7A remain.

## Current post-CI selection correction and separate open geometry finding

CI 39397657922 at commit 7fb274b exposed two independent failures. Desktop old481 retained its original checked/focus assertions: Space collapsed the new standalone heading but the outside-click handler then cleared selection. The narrow WebKit check separately measured a fractional header endpoint beyond its scroller. Neither original test or timeout was weakened.

The selection fix adds only `.pgroup` beside `.prow` to the existing inside-selection selector. The NEW desktop RTL regression first failed meaningfully after the first Space (old five cases passed), then **all six RTL cases passed (5.71s)** with userEvent keyboard/mouse, real outside clearing and no-write assertions reached. The original unit prefix, all financial handlers and existing test bodies remain unchanged from the reviewed commit.

The next fresh E2E build passed. Its whole canonical batch recorded **31 pass / 2 NEW fixture failures (5.2m)**: all prior 29 cases and both new 768px diagnostic cases passed; the two new selected-desktop cases reached Space/Enter/mouse retention but stopped because their proposed Rail outside-click target is absent while selection is active. That target was corrected to the actually visible, connected September 2026 H1 outside `.plan`; the original unforced click, clearing, budget equality and write checks were retained.

The failure-only corrected selection run then passed **5/5 (26.1s): 3 setup + 2 light/dark cases**. Both true 1440×900/DPR1/fine contexts reached all seven keyboard/mouse/outside stages, exact four Wohnen category identities, unrelated single-category exclusion, full budget equality and `writes=[]`. This reused the exact 168 compiled files from the preceding fresh build, with full source/compiled/mode/process/archive/lock checks. It is **not a new build or one whole 33-case pass**. Raw archives are `721-desktop-selection-and-768-fresh-canonical-native-first-actual` (result SHA256 `38ba2f0a…`) and `721-desktop-outside-h1-selected-two-native-first-actual` (`93819c37…`); the latter source checkpoint is e235e422 at HEAD 7fb274b plus reviewed working changes.

Both local 768px themes measure table width 578.78125, integer scrollWidth/clientWidth 579/474, maximum scrollLeft 105, headerRight 738.78125 versus scrollerRight 739, textRight 730.78125 and actionRight 726.78125. The focused action's centre hits its original SVG descendant; fonts are loaded. The labelled later diagnostic clamp leaves those values unchanged. **The CI value headerRight 739.421875 versus 739 remains unresolved** (CI actionRight 727.421875, documentWidth 768). Local measurements do not establish failed-CI text clipping, harmless rounding, a font cause or a fix. Existing strict old481 line896, CSS and all tolerances remain unchanged; exact-head CI must supply its own geometry.

## Full-check history and remaining gates

The original required full check passed with **549 files / 4932 tests in 452.08s of Vitest duration**, using `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2` and Node 22. The separate normal production build then passed. All seven phase/source/process/archive/wrapper/lock exits are 0; all 3485 working paths, 16 owned paths, permissions, HEAD 208cf9d1, index and exact dirty status stayed unchanged at freeze d13759cb. Only exited esbuild zombies remained; no owned live process remained. Raw result: `481-separated-required-age-full-first-actual/result.json` (SHA256 `14815f08…`). The known panel lint warning, JSDOM scrollTo notices and build size warnings remain recorded.

The current selection-corrected source passed the required full check: **549 files / 4933 tests, 427.89s Vitest duration**, with `BUDGET_REQUIRE_AGE=1 VITEST_MAX_WORKERS=2` and Node 22. The separate normal production build then passed. All seven exits/guards are 0; all 3485 working paths / 16 owned paths, modes, HEAD 7fb274b, index/status, owned processes and lock checks remained exact at freeze 9244130d. Raw result: `721-current-selection-required-age-full-first-actual/result.json` (SHA256 `7464e0a0…`). Only these two factual result documents change afterwards; all source/tests, four PNGs and six-profile JSON remain exact.

This validates HEAD 7fb274b on Main 208cf9d1 plus the reviewed 9244130d working changes, **not the subsequently LIVE Main d8bc8d34 or a combined integration head**. The older 549/4932 and 29-case capture checkpoints remain historical; the current native evidence is still the separate 31/2 and corrected targeted5 runs above. Final independent review, ordinary Main refresh, exact joint-head CI and coordinator integration/public-LIVE verification remain pending. **CI768 strict line896 remains OPEN**; no tolerance, CSS or causal waiver follows from this local full pass. Keep #481 open.
