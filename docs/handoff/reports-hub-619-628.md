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
