# SPEC-005 — Saved report queries and filtered CSV

Status: proposed additive specification, baseline `01a10de8` (2026-10-15). WP-009. Existing `SPEC.md` and owner directives prevail.

## 1. Goal / user problem

People repeatedly set the same report filters and need a reliable way to return to them. They also need to export the rows currently shown by a filtered report for personal analysis. Budget already has 34 report entries and an Explorer with 20 browser-local saved views; improve portability and a narrow export gap without replacing the reports experience.

## 2. Sources / reference behavior

References: ACT-081–089, PP-081–090, YNAB-064 and Toolkit report routes in [the matrix](../feature-matrix/features.csv). The selected increment adopts saved analytical intent, not upstream dashboard composition.

Retain `apps/web/src/nav/reports-catalog.ts`, report pages/filter state, `packages/domain/src/overview/explorer.ts` and `apps/web/src/reports/explorer-views.ts`. Explorer currently stores up to 20 named views in localStorage; each query has dimension, class, columns, period and measure. It supports five dimensions, four column modes, six named periods plus calendar range, three measures and a 200-row cap. `apps/server/src/api/export.ts` provides authenticated CSV/ZIP export; report CSV exists in `apps/web/src/reports/income-expense-report.tsx` and `total-table-report.tsx`. Backup/recovery is separate from report export.

## 3. Intended Budget behavior

Preserve all 34 report destinations and their current filters, scopes, calculations and URLs. Add bounded saved-query preferences for the existing Explorer query model, retaining the 20-view and 40-character name limits. Make them available across this user's authenticated sessions/devices, while retaining the four presets and current local views through migration. Add filtered CSV export first to Explorer, using exactly the current validated query result and visible columns, with period/scope and units identified.

## 4. Scope / exclusions

In scope: save, rename/replace, delete, order and apply named Explorer queries; bounded server persistence; read-only filtered CSV for Explorer. Other reports keep their current controls/exports. Excluded: dashboard builder, drag/drop widgets, arbitrary AQL/SQL, new report families, cross-report composition, calculated-field scripting, third-party query syntax, shared queries, changing report math/scope or arbitrary report packs. Parent report groups are not duplicated as child catalog entries.

## 5. Flows / error / empty

In Reports › Explorer, choose filters then `Ansicht speichern`, enter a name and confirm. Reusing a name replaces its query only after confirmation; `Ansicht löschen` removes only that preference. Applying a view validates it and updates existing controls and route state. At 20 views, block another save with an explanation; deletion frees a slot. If a query becomes invalid after a future migration, show `Ansicht nicht verfügbar` and do not execute a partial interpretation. `CSV exportieren` downloads only the current validated query result. Empty results use the defined headers and one explicit empty metadata row as specified below. Loading/error states reuse `LoadingNote`/`ErrorNote` and retry. Export failure does not alter a saved view.

Resolve the empty-result choice as a header plus one `record_type=empty` metadata row, with no invented financial result. CSV is UTF-8 with BOM, semicolon delimiter and doubled-quote escaping consistent with existing ZIP serialization. Prefix columns are `record_type,report_key,period,dimension,class,measure,unit,truncated_count,row_key`, followed by current pivot columns. Each data row carries the active query metadata; unit is `cents` for monetary sum/rounded average or `count` for booking counts. Never mix localized monetary text with numeric values. An empty row has query metadata and blank value cells. Formula-safety applies to text cells, while signed numeric cents remain numbers. This filtered file contains only data already available in the authenticated bounded report; it never falls back to global export or bypasses the separate full-ZIP step-up policy.

## 6. Business rules / formulas

A saved preference stores only the validated Explorer tuple `dim`, `cls`, `cols`, `period`, `meas`; use `parseExplorerQuery`. Period is one of `1M`, `3M`, `YTD`, `1J`, `3J`, `Alles`, or a valid calendar range. Never trust client-supplied results. Apply/export recomputes through the authoritative report read model. CSV matches visible pivot rows/columns, current truncation policy and exact units; numeric output comes from underlying integer cents, not localized display text. Escape delimiters/quotes per RFC 4180 and neutralize untrusted text beginning with `=`, `+`, `-` or `@` for spreadsheet safety while preserving raw values in Budget. Identify currency/unit. Export never mutates financial state.

## 7. Examples / edge cases

Saving `Wunsch je Quartal` with `{dim:kategorie, cls:want, cols:quartal, period:3J, meas:summe}` and applying it restores those five controls. Twenty views are accepted; the twenty-first is rejected without overwriting any. Names are trimmed, at most 40 characters and case-insensitively replaced. Unknown dimensions/measures or malformed ranges are rejected, not defaulted. Zero rows export headers and a truthful empty marker, never an unfiltered report. A label `=HYPERLINK(...)` is neutralized in CSV. A 201-row result follows the existing 200-row cap and states that one row is truncated; it must not claim completeness.

## 8. Model / migrations

Recommend a small additive `saved_report_query` table: `id`, `report_key` (initially `explorer` only), `name`, validated JSON query, `sort_order`, timestamps and query schema version. Enforce case-insensitive unique names and maximum 20 at repository/API layer. There is one Budget owner; do not invent multi-user or sharing semantics. Migrate localStorage views on first authenticated use, preserving order and valid queries; on conflict retain the server copy and offer bounded merge without duplicates. Keep local data recoverable until sync acknowledgment. Never store report rows, balances or booking snapshots. Prefer extending an existing preference table if one supports the same semantics.

## 9. Interfaces / integrations

Proposed `GET /api/reports/saved-queries?report=explorer`, create/replace, rename/order/query update, delete, and validated Explorer CSV route/action invoking the same parser and server read model as current JSON Explorer. Names are proposals. Reuse `parseExplorerQuery`, `explorerPivot`, `EXPLORER_ROW_LIMIT`, report metadata and authenticated CSV streaming. Allowlist report keys/query fields; reject unsupported schema versions with structured 422. No general query endpoint and no executable SQL, AQL or raw JSON filters.

## 10. Navigation / design

Keep the 34 Reports destinations in the left navigation and deep-linkable routes. In Reports › Explorer put saved views beside filters with labels `Ansicht speichern`, `Ansichten`, `Umbenennen`, `Löschen`; export is `CSV exportieren`. Applying a view updates current route/query so browser back/forward remains clear. Reuse existing loading, error, empty, table and chart patterns. The global search modal exception does not apply to Reports. Use an input dialog only for view names. Show active period/scope and that CSV contains the filtered result. Keep keyboard access, screen-reader labels, small-screen table scrolling and 44px touch targets; add no dashboard tiles.

## 11. Privacy / security / performance

Saved preferences can reveal category/classification choices; require authenticated session, same-origin/CSRF policy, per-budget authorization and no public sharing. Store preferences, never result rows or amounts. Escape UI text, neutralize CSV formulas and use safe content-disposition names. Cap views, names, filter values, date range and response size. Export uses existing bounded report query paths, avoiding N+1 reads and duplicate calculations. Export is explicitly user-triggered and read-only. Preference changes must not create financial audit entries.

## 12. Dependencies

WP-009 / SPEC-005; CAP-014 with CAP-013 export and CAP-012 auth boundaries. Dependencies: report catalog/routing, Explorer parser/pivot, current local saved views, authenticated API, database preference conventions and safe CSV serialization. No third-party analytics or query engine. Other report families, dashboard composition and calculation methods need separate specifications.

## 13. Acceptance criteria

- AC-005-01: All 34 current report entries/routes, filters and calculations remain available and unchanged.
- AC-005-02: Valid Explorer queries save/apply/rename/delete across authenticated sessions; maximum 20, names maximum 40 characters.
- AC-005-03: LocalStorage migration preserves valid views and order, resolves duplicates deterministically and keeps recoverable local data until acknowledgment.
- AC-005-04: Invalid/stale queries are rejected or marked unavailable; no malformed query silently broadens its scope.
- AC-005-05: CSV reflects only active validated query/result, declares scope/period/units, safely encodes text/formulas and makes no financial writes.
- AC-005-06: Existing filters/presets remain usable if preference persistence or CSV export fails.

## 14. Tests / validation

Use literal saved queries and expected values: reload all five fields; test 20/21 boundary, duplicate names, 40/41 characters, invalid fields/ranges and schema-version rejection. Test local migration on success, conflict, offline and retry without losing unsynced data. For CSV, use a two-row fixture with exact expected cells, integer-cent cell `1234` and unit `cents`, semicolons, quotes, newline, Unicode, negatives and formula-leading labels; assert decoded cells and no write calls. Test empty and 201-row output metadata. Regression-test representative routes and assert all 34 catalog IDs remain registered; current Explorer defaults/presets remain unchanged. UI tests check German controls, active query, loading/error/empty, keyboard and phone behavior. Expected values are independent fixtures, not generated by the production pivot.

## 15. Open decisions / recommendations

Recommend syncing only the existing bounded Explorer query tuple across this user's sessions, retaining presets/local views during migration, and adding read-only Explorer CSV first. Stop before other report families, dashboard composition, sharing, arbitrary query syntax or calculation changes. If the owner wants browser-local views only, retain the current 20-view behavior and limit the server change to filtered CSV; synchronization is not a prerequisite for the core report contract.

Use the integer-cent CSV schema above for the literal tests; the suggested decimal-output alternative is not part of this contract. The existing application export allowlist stays unchanged; database backup naturally retains the preference table, while adding preferences to portable ZIP requires its own schema decision.
