# Reports hub and saved-view chips — source review checkpoint

Private isolated source based on checked c31afb1af3c2a01c0c45ca084722cbfd84c76e02.
Read owned issue/parent decisions and coordinator readiness/consumer preflight.
Owned patches were verified against their archive manifests:

- 628: 14,405 bytes, SHA256 c105d9c2c46eeabb74aa54751bed17124f77756c1ccffc0893af862511ec6bd2.
- 619: 26,929 bytes, SHA256 9115f16980ac471aefb3350bae8df32e6457d88b03f260649fb294b319da3309.

Selective adoption order was 628 then 619. Newer Explorer exact-window parsing,
heatmap exactWindow, memo dependency and explicit-template clearing are retained;
context conflicts were adapted rather than replacing current report/router code.
The current 33 report bodies and existing liquiditaet-to-Plan route remain;
financial dispatch is retained. Hub metadata provides the owner-mapped sixteen
entries, not sixteen completed consolidated report implementations.

Draft literal hub/session/parser and saved-chip freshness tests are included.
Old navigation/header mocks receive only the new link-hook fixture, preserving
their original guards; reports-search hub selectors address the combined row,
while all original global search routes and financial assertions remain.
New archived icons explicitly retain 16px/1.75 stroke conventions.

## Test-file rationale

- `report-hub-619.test.ts`: independent literal sixteen-ID/order/group mapping, retained 33 report bodies plus existing Plan forecast route, name/question search, bounded session-only three-ID recents and parser preservation for `exakt`.
- `saved-explorer-628.test.tsx`: stale hub data stays hidden until fresh server response, ID-only destination, no local promotion/write, amount-name privacy, separate uncached entry/generation read and unavailable-ID guard.
- `report-navigation.test.tsx` and `area-head-report.test.tsx`: add the existing router link hook to their synthetic router mocks because the new switcher uses real AppLink; retain all original keyboard/input/dialog and metadata assertions.
- `reports-search-package.spec.ts`: adapt only the two initial old hub labels to the new combined Budgettreue row and search input; retain every original global-search destination, booking/action and financial assertion.
- `issue-619-628-reports-hub.spec.ts`: complete canonical desktop/Chromium390/WebKit cases in both themes. Literal16/8-1-3-4 groups, continuous numbers, whole-row link geometry, three actual report visits retained in session, search by name/question, removed named register navigation, desktop <=900px, phone44px, Axe/no-overflow and keyboard switcher. Real independent contexts save then reload chips, assert ID-only URL and exact stored/result query, edit/reload current server configuration, preserve privacy, delete without default results/save, explicitly recover and retain exact-window/template clearing.

## Reviewed old-consumer adapters

Independent HIGH source sweep at ce22 identified three deterministic old catalog
consumers and one new asynchronous test setup gap. The production source remains
unchanged by this delta.

- `e2e/shell.spec.ts`: replace the removed33-row/five-assembly DOM with the exact16 continuous numbers and four named group chips. Retain literal question text, no catalog control/forecast CTA, both-theme whole-row hover background and transparent children, no overflow, screenshots and the actual fourth-row question click to Geldfluss. Replace old assembly side-by-side geometry with the new owner single-column no-overlap geometry.
- `e2e/nav-registers.spec.ts`: preserve the entire Vermögen register overflow/fade assertion. Reports now explicitly has no register, lists16 entries and opens the real Ausgaben entry with the visible switcher; settings retains its original no-register assertion.
- `e2e/assets-debts-report.spec.ts`: the retained wealth-group URL now exposes the unique canonical hub label Vermögen und Schulden and exact original report destination. All existing financial/history/period/body checks in the file remain unchanged.
- `e2e/issue-619-628-reports-hub.spec.ts`: after clicking delete, require both editor disappearance and literal server views=[] before reloading the independent context. This removes a POST/reload race while retaining the unavailable-ID/no-result/save-disabled assertions.

No timeout, retry, skip, money/privacy/Undo/keyboard oracle or baseline is changed.
These technical adapters require independent exact-delta re-review and remain
source-only until the coordinator schedules focused proof after H priority.

## Source compatibility audit

The entire `ReportPage` financial dispatch/fallback block through `ReportGroupRoute` is byte-identical after newline normalization to base c31afb1af3c2a01c0c45ca084722cbfd84c76e02 (SHA256 fd47e1e27f28aee49aa9dfefd557d531e1634d4eae5a6bf09f49cf6b03116d4e). Router, financial producers, saved-view writes/CAS/migration/Undo and all report bodies are untouched. The current exact-window heatmap condition, memo dependency and explicit-template clearing remain in place. Only entry reads and unresolved-entry presentation are additive.

Bounded consumer review covered area/nav/global-search, report-frame/header, full-width/phone-layout and existing Explorer625/626/627/624. Existing routes remain; old Explorer financial/CSV/Undo/browser oracles remain unchanged. No compared screenshot baseline was regenerated or added. Old full-width captures are evidence only. Independent review and a coordinator-scheduled focused proof must validate actual layout and unchanged consumers before publication.

No local Node/npm/test/build/browser/lint/formatter or remote reports proof was run. New browser coverage is source-only and unverified; no passing runtime/visual/one-screen claim is made. Formatting is intentionally left to the approved remote proof/patch workflow. No public push/PR, redirects/consolidation, financial writer or parent closure. Parents487/488/517 stay open; this package does not adopt a report template across all sixteen reports.

## First exact-source proof and bounded corrections

Exact9703 proof40573209635 actually passed CSS tokens, all4 scoped unit files,
build, all15 directly affected old browser cases and the tracked-mutation guard.
New browser cases:5 passed (3 setups plus complete619 mobile/WebKit),4 failed.
Desktop619 ended at920.6875px against the unchanged900px acceptance bound.
All3 saved-entry cases stopped before their first UI request because the new
fixture omitted required category.group_id. Saved-entry runtime acceptance is
therefore still unproven; no passing saved-ID/privacy/CAS claim is made.

Static failures: ESLint rejected a keyboard listener directly on native details;
typecheck rejected spreading the tagged one-element savedViews query key while
replacing it with the four-element entry key. Neither required a money/API rule
change. Move Escape handling into the existing document listener, restricted to
an open switcher containing its event target; preserve native summary focus and
all old adjacent-report keyboard/input/dialog guards. Extend its existing unit
with literal inside/outside Escape and focus checks. Construct entry query
options explicitly with the same authenticated GET, retryfalse, fresh4-tuple,
gc0 and always-refetch behavior, without a type cast.

The desktop shell gap before this hub is44px. A hub-only desktop override uses
the existing12px --space-md token, saving32px without shrinking fonts, changing
rows/controls or affecting report-body spacing; expected bottom888.7px must be
measured by the unchanged900px test. Phone44px rules remain. Add only a synthetic
category_group and its group_id to the fixture; the independent12345-cent booking
and all saved-query/result/URL/privacy/deletion assertions remain unchanged.

The complete15-path remote formatter patch at
C:/Users/fabia/.codex/tmp/reports-619-628-proof-40573209635/proof-format.patch
is68094bytes, SHA2564d2d5e2314958730ea8e579f4bb89b031bdee96a57ec76c59226b46079d64f21.
Every hunk and the allowlist were inspected; apply-check on clean9703 and reverse
check immediately after exact application both passed. No local formatter ran.

Artifact12765911449 retains OLD catalog/search PNGs, not the earlier new-test
traces: the later compatibility invocation cleaned default test-results before
upload. Raw failure frames and numeric geometry are retained in the full log.
The next disposable proof must copy the default new-case results to a separate
durable artifact directory BEFORE invoking compatibility tests, without changing
canonical configuration, retries0, snapshotsnone or failure outcomes.

No protected money/body/URL/Undo/privacy/timeout/skip assertion or baseline was
weakened. These source/fixture/static changes require independent HIGH full-delta
review, then one coordinator-scheduled necessary focused proof before publication.

## PR801 first full CI: isolated router mock compatibility repair

Immutable ee6b full CI40582154381 unit(1) job122464232339 failed importing two existing AreaHead suites before their assertions ran: Vitest mock had useParams only, while AreaHead now imports ReportNavigation, which imports AppLink and its module-level useLinkProps reference. Raw stack is app-link.tsx5 then report-navigation.tsx4. Static and unit(2) passed; other full shards were still running when this narrow repair was prepared. No complete-run success or final failure inventory is claimed yet.

Per-file technical test reasons:
- `apps/web/src/pages/area-head-566.test.tsx`: extend only the router mock with the existing href/onClick adapter already used by area-head-report.test.tsx. All Stand/bank-status/source-boundary/supplied-field assertions remain exact.
- `apps/web/src/pages/area-head.test.tsx`: same missing import adapter, preserving all recovery-session, account-source-date and sync-label assertions. No test removal, timeout/skip/baseline or production change. Non-report cases do not render ReportNavigation, so no new navigation behavior is mocked or asserted here.

The repair needs independent HIGH delta review and one bounded affected-suite proof before the same PR update. All remaining immutable full CI shards must be collected first; no new push/full CI/publication is authorized by this source-only repair. No local Node/npm/test/build/browser/lint/formatter ran because of the host RAM rule.

The same immutable run's visual job122465303210 added two intentional-UI compatibility classes (desktop/mobile each): the old active-view check still expected Reports' removed Monat register; the Reports hub light baseline changed after adding recent/saved sections. Actual totals:116passed/4failed/17configuredskipped; do not treat intentional pixel differences as approved baselines yet. Artifact12770676487 was downloaded intact to private/801-visual-artifact. Desktop/mobile first-attempt actual/expected/diff PNGs are retained under test-results/shell-regression-baselines-1e6cd-n-screenshots-light-reports-{desktop,mobile}; representative actuals were inspected. Both show the intended new hub sections with16report list; desktop fits900px, phone remains a vertical list. Root independent visual approval remains required before updating only those two affected baselines; no baseline was changed in this repair.

`e2e/shell.spec.ts` technical reason: replace only the obsolete Reports Monat-register assertion with the authorized absence of registers, exact Geldfluss heading and actual opened report-switcher current identity (4. Geldfluss/href). Every other active-area route, Buchungen register and settings-current-view assertion remains unchanged. No timeout/retry/skip or screenshot assertion/tolerance was changed. The new view identity is checked rather than dropping active-view coverage.

Old mobile `income-targets-report-ranges.spec.ts` failure headerFits is a stale hidden-node selector: it included the newly hidden inner report h1 (the phone app header carries the visible title) and the search input inside the closed native report-switcher details. Such nodes have zero rectangles, so old all-node comparisons fail against a nonzero cell left edge. Retained artifact12769709814/error-context/trace final390x844 frame shows visible report switcher/period controls fit and the visible app h1. No per-node numeric rectangles were recorded; no claim of measured ones is made. Coordinator authorized the narrow technical adapter: require visible report h1/navigation/period control, then compare only nodes with getClientRects().length>0 using the SAME exact left/right bounds. All9range options, period/custom URL/reload, trend, amounts, Axe, nooverflow and desktopalignment assertions remain unchanged.

Another distinct full failure is a real desktop header-growth regression: all5 old552 frame cases expected64 but got66.1875. The new44px switcher row plus existing18.1875px subtitle line,2px row gap and2px borders accounts for66.1875; do not change the old64px oracle. A scoped production layout correction remains pending coordinator decision and independent review, not covered by the hidden-node test adapter. No baseline has been approved or changed.

Coordinator approved the bounded product fix after the exact552 arithmetic diagnosis: desktop `.titleblock-report .report-switcher summary` now uses min-height38px, matching the existing desktop `.rpc-step` height. The base switcher remains44px on phones, desktop report header retains existing min-height64px, and title/subtitle type, gap, borders, focus/keyboard and native details semantics are unchanged. Old552 exact64px and all existing browser geometry oracles remain byte-exact. This is a production layout change requiring independent HIGH delta and focused old552/header/route tests, not a permission to regenerate baseline images.

ROOT independent visual review approved ONLY the two captured Reports-light hub baselines after resolving the stale global glyph concern by source comparison (no non-Reports icon change in this package). Copied exact first-attempt actual bytes from immutable run40582154381/artifact12770676487, without recapture: shell-reports-light-desktop-linux.png SHA25606525DD7CB8C1B785050E119EDA21AF672E58CE7D001F5AA0129993D9B5BB5FC; shell-reports-light-mobile-linux.png SHA256615EA841484D39AB0164F7B5225B46B73FA9BBE6B73B5AF46CF484AB3DC805A5. Source and destination hashes both verified. Reason: intended16-entry hub, search/group controls and recent/saved sections replace old catalog/register view. Desktop switcher38px fix does not render on the hub; no other golden/tolerance/retry/timeout/skip was changed. This approval does not waive existing #55264px or period/header fit proofs. Root review recorded in private/619-628-root-visual-review-2026-10-27.md (coordination checkout).

Read-only diagnostic40587142466 at exact formatter head dfbc retained actual numeric geometry before the unchanged assertion: mobile title cell left17/right373; hidden inner h1 displaynone/clientRects0; CLOSED report-switcher search INPUT left-68/right256, clientRects1 but checkVisibilityfalse. The first client-rect-only adapter was insufficient for native details content; this is not visible header overflow. Test now filters with checkVisibility before the SAME exact bounds comparisons. Explicit visible main h1/report-navigation/period assertions, all original9range/URL/reload/money/trend/Axe/nooverflow/desktopalignment checks and timeouts remain unchanged. No production source changed. checkVisibility is already used by canonical phone-layout/issue526/738 browser tests; project DOM libs support it, with actual type verification still remote. Diagnostic source instrumentation was transient and restored with git diff exitcode; raw result honestly3setupPASS/1originalmobileFAIL, not a claimed proof pass. Next narrow proof must run the complete old mobile case after independent delta re-clear.

Measured follow-up40588032194 at135: complete original old mobile ranges4/4 firstpass; existing new619desktop/mobile4pass/1fail, solely desktop summary38 vs an unqualified new44 expectation. Owner #619/#62844px requirement is phone-only; coordinator/root authorized scoping only this new summary-height expectation to phones, retaining clicked/visible/focused desktop behavior, all existing link44 checks and old552exact64. No old geometry oracle is weakened.

The same transient read-only diagnostic independently exposed a real PHONE defect in both themes: open menu x-77..265 and actual visible search input x-68..256 at viewport390; details x29..265. Right0 anchored a342px menu to the narrower flex item and clipped its left controls. Small phone-only CSS now uses left0/rightauto; desktop positioning, menu width/maxheight/scrolling, type/tokens and navigation semantics unchanged. Strengthened existing619 case requires OPEN menu AND input rectangles fully inside viewport on phones, input>=44px both dimensions and real center hit ownership before unforced fill; all original search/count/Axe/Escape/focus/keyboard/money/URL/privacy assertions remain. No overflow-hidden masking, baseline, timeout, retry or skip change. This production positioning fix needs independent HIGH delta and new619desktop/mobile/WebKit plus relevant oldmobile focused proof before final public CI.

## Supported maximum saved-view state: source-only coverage addition

Root requested max-state proof before final public CI. Exact source correction: Hub CSS ALREADY bounds saved chips to max-height44/overflow-yauto (phone96), even though shared chips wrap. No evidence yet that20 names grows Hub height or loses links; no speculative CSS change is made. Added one isolated synthetic case in existing619spec using the real authenticated GET revision + POST kindimport saved-queries API with20 distinct40-character names and canonical valid existing Explorer query choices. No SQL/production settings/new writer/default fallback is used; names and20unique returned IDs are checked against canonical returned order.

The case visits3report routes to establish3session recents, requires20savedlinks plus16catalog entries, and desktopHub bottom<=900 in both themes. Starting by focusing only the first saved link, it reaches every remaining link with real Tab (no forced per-link scrolling), checks each exact ID href, full link bounds inside the ACTUAL scrollport client rectangle and viewport, and center hit ownership. It verifies the strip really scrolls, preserves phone44 via existing inspect helper, runs Axe/no pageoverflow and retains bounded max-state PNGs. This is added acceptance coverage, not a change to existing money/URL/privacy/timeout/retry/skip assertions. Empty-state hub baselines and all CSS remain byte-exact. Independent HIGH test-delta review and one bounded max-state proof are required; no passing max-state claim is made yet. The prior5c switcher VM remains immutable and its results separate.

## Exact2de full CI failure audit and technical proof structure

Immutable PR801 full40590282948 TERMINAL RED has exactly two scoped classes, after all shards collected: new max20 WebKit link-border containment and old544 cumulative five-register30s case. Other full jobs passed. Source/protected domain/API/financial values, baseline PNGs, timeout/retry/skip configuration remain unchanged by the following repairs.

Read-only40594193201 at exact2de established genuine fractional link border clipping: focused max-state WebKit link5 border bottom380.25 while scrollport outer284..380/clientHeight96/borders0/padding0, scrollTop282, center hittrue at390x664/DPR3. This was not integer-rounding evidence and no epsilon/CSS workaround is authorized. Own619 acceptance is complete readable keyboard reachability. The technical max-state check now measures EVERY non-whitespace text node's EVERY rendered DOMRange rectangle, requires no empty text range, exact full saved name, and exact floating scrollport interior bounds derived from outerDOMRect minus computed borders in the SAME coordinate space. It retains all20 real Tab/focus/ID href, whole-link viewport bounds, real center hit, phone44, actual scrolling, no pageoverflow/Axe and desktop<=900. No text line or target is silently omitted; no numeric tolerance added. This changes the new acceptance check from an overstrict border-box requirement to the actual complete-label requirement without weakening keyboard reachability.

Per-file reason `e2e/issue-544-portfolio-registers.spec.ts`: retained initial/retry trace shows complete five-register navigation/reload and nearly all five×two theme accessibility/capture checks; final screenshot started234114/ended234375ms after test start204240ms, while after-hooks already began233936ms near30s deadline. No stuck API/dialog or failed financial/period oracle was found. The old monolith is structurally split: SAME sequential five-register period-preserving link/click/current/reload journey remains one test; EACH of five registers gets its own independent light+dark Axe, font-ready, pagewidth/desktop1800-height, every link x/width/44/no-clipped-label and unchanged bounded screenshots test. Shared loaded-register readiness retains literal88,000.00 for overview/positions and all original per-register loaded elements, called by journey AND individual captures. The separate640-breakpoint, endpoint/positions independent8,800,000 and closed-month8,686,069 tests remain byte-exact. Every case retains canonical default30s, no added timeouts/retries/skips, and all original assertions remain represented rather than discarded.

Both test changes require capable independent HIGH whole-delta review before ONE focused impacted max-state/all3profiles and split544 journey/each-register proof. No public source push/full CI before real targeted green. Plan449/450 source7f remains frozen in its separate checkout; no Plan runtime/VM or shared source edits.
