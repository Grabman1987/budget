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
