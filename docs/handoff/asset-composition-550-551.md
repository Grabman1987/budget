# Net-worth asset composition #550/#551 — source-only recovery

## Authority and ownership

Isolated checkout I / codex/asset-composition-550-551, immutable checked/live base
1ad02264f33dd07104fafdf99a58688d34f2856f. Only this checkout was edited. Parent524
remains open; #549 is closed. Owner550 comments6315202737/6315660646 establish
signed net worth as denominator, negative debt shares and euros only below100EUR
or with incomplete quality. Literal1000000−200000=800000 cents gives12500/−2500bp.
No financial writer, FX engine, setting, production data or new account policy.

Archive ec159bb98e89872edd51e2c1efe28a62f10cb1b7 is preservation material, NOT
validated ancestry. Its original da796 source commit is unavailable. The OWNED
patch is40168 bytes, SHA256
596aea73532be1765067cbc24a28e28f377401140fffcef257808a5ddafcdaf8.
Whole13-path archived source review4902 bytes SHA256
a39046f956f814bd610e896a2f3ff4ae01028619cc28f10971f0443029e25be1.
Both complete pins and packet/manifest ownership were verified before adoption.
No branch/cherry-pick/mixed ancestry was transplanted, and prior source clearance
is not claimed as current runtime evidence.

## Selective adoption and current producer

Eleven owned paths applied by scoped hunk after current-source inspection and
apply-check. Only two context conflicts were handled manually: append one db
export without losing current exports; append a current roadmap source-only
note without copying stale roadmap ancestry. SPEC records the explicit owner
share rule. No old release/status claims were adopted.

The existing portfolio producer was proved byte-preserved: reverse ONLY the
seven additive extraction runs, git diff --exit-code against1ad passed, then
reapply those exact runs. Cash/manual and each holding component come from its
already-rounded EUR terms in the SAME memoized valuation. No account-minus-
holdings residual, aggregate FX rerounding, new quote lookup, extra reference
cash or producer guard change. Existing account values, netWorthAsOf, daily
Gespart/Markt chain, old account composition fields and11-type report remain.
The new read adapter uses true historyDays(month) ends/start/as-of anchors;
old DTO fields stay intact and new fields are optional for cached clients.
Current unversioned account/security classification of historical money is
explicitly disclosed. Missing signs remain unknown/null with a known subtotal;
new display-group overflow suppresses that grouping/shares without swallowing
operand/original producer/FX errors or changing safe whole-account values.

Archived component/chart source was adapted only for stable semantic group/
zero-axis attributes and amount spans, plus keeping previous whole-account
ordering (positive descending, negative ascending, unavailable last). Pure
projection/maths are unchanged. The old daily Gesamt chart remains the default;
monthly composition is separate and uses straight sample segments, no invented
daily values, signed debt below zero, and identical tooltip/table DTO points.

## Tests and per-file reasons

The initial domain/DB/API regressions were committed before source adoption
(756e68d1). No local execution was possible under the host RAM restriction.
- domain networth-composition-550.test.ts: independent800000 literal conservation,
 12500/−2500 signed shares,10000/9999/zero/negative threshold, stale/estimated
 no-shares, null missing gap, reference cash once, manual balance fallback,
 new group-only overflow while each old account remains safe.
- db networth-composition-550.test.ts:1USD cash cent and1USD holding cent at0.5
 each round independently to1EUR cent, total2 (not rerounded subtotal1); true
 Jan31/Feb28/start/as-of/one-day anchors, literal7000 manual fallback, existing
 2500 transfer cash→depot changes group10000→7500/2500 but total/Gespart stay,
 one canonical grouped Undo restores BOTH accounts/history, missing FX remains
 null and old strict netWorthAsOf still refuses. No writer implementation change.
- API networth-composition-550.test.ts: fresh1000000/−200000 account fixture,
 old daily/lead and every new dated group sum independently800000, final point
 matches current DTO,12500/−2500 shares. No snapshot-as-own-oracle substitution.
- web asset-composition-551.test.tsx: known/null/known monthly gap produces no
 bridged areas or net line, two known markers, same literal123.45EUR in keyboard
 tooltip/table and masked through existing reactive privacy state.
- new issue-550-551 E2E: real isolated10000/−2000EUR accounts, native group/account
 drill and125%/−25%, exact dates/group/daily/lead equality, actual negative SVG
 geometry, last keyboard/pointer/table parity, both themes/privacy/Axe/nooverflow,
 44px on phone and return to existing Gesamt. Default desktop/390/WebKit config.
- OLD networth.spec.ts: only obsolete direct .vbars composition case adapts to
 actual grouped/account UI and signed monthly drawing. Retain original sample
 84730EUR, now assert EXACT8473000 cents for groups AND whole accounts (rather
 than old whole-EUR row rounding tolerance), >=2 negative accounts, all negative
 signs and original positive-account descending order. Old shared zero/bar
 direction oracle maps to one shared chart zero plus every positive area above
 zero and debt touching/strictly below zero. Old dashed bar caption is replaced
 by real debt-below-zero explanation, not a false old selector. No lead/chain/
 period/history/quote/privacy/Axe/reference-crop/timeouts/skips/baselines changed.

## Bounded old-consumer and baseline inventory

Only the above old networth.spec composition case directly consumes .vbars/
.vb-val/.vb-bar and obsolete debt-bar caption. wealth-detail-pages/full-width
uses unchanged .vnw/.vcomp geometry; wealth-ux-v1 and exact-lead read unchanged
lead/history; assets-debts/wealth-history use unchanged legacy report paths;
missing-quotes/issue511 quote oracles stay. networth-gespart's old cached view
omits optional new DTO fields and therefore retains the legacy fallback.
No blanket adaptation of22 referencers. Four existing Linux own baseline PNGs
for networth (desktop/mobile, light/dark) will genuinely change through the
intended new default groups and chart toggle. They are NOT regenerated or edited;
future bounded canonical screenshot proof requires actual visual review before
any allowlisted baseline update. Old reference masks/tolerances remain intact.

## Limits and next gate

Source only: no local Node/npm/test/build/browser/install/lint/formatter, no
Cloud dispatch, public PR/push/full CI, settings or production operation. All
new runtime/format/geometry/visual evidence remains pending. Independent capable
HIGH current full diff precedes ONE scheduler-approved focused literal/static/
new three-profile browser and specifically affected old networth consumer proof.
Any concrete failure must be diagnosed without weakening financial/security/
Undo/timeouts/skips/retries or blindly regenerating baselines. Parent524 is not
closed by this package. Refs #550 and #551.
