# Reports audit package 1: retained template proof

Scope: #1156 only. No runtime code or financial formula changed. No shared-shell
defect was found; #1161 remains a separate table/sign inventory, including Explorer,
contacts, portfolio and chart-generated tables. No migration or private data access.

## Reproduction and test changes

- `explorer-templates-625.test.tsx`: ON failed before `template-total` because jsdom
  lacks `matchMedia`, called by the actual report disclosure. Supply desktop media
  and scroll APIs, open the retained editor, explicitly enter the custom view where
  intended, and assert the ON v2 section preference key (OFF keeps its legacy key).
  Replace the CSV substring check with independent complete literal UTF-8 bytes,
  including BOM, CRLF, row order, all cents and the current-month marker.
- `explorer-template-csv-625.test.tsx`: same browser prerequisites; custom CSV tests
  explicitly enter `darstellung=eigene`, since ON defaults to the heatmap. Keep
  pending-export rejection, exact custom bytes, filename and URL revocation checks.
- `nav/redirects.test.ts`: stale OFF expectations, not router defects. ON literals:
  costs -> `/reports/psteuern` with `bankkosten`; finance check ->
  `/reports/onepager` with `finanzcheck`; contacts stays `/reports/kontakte`.
  OFF destinations remain asserted. Hash, query, recipient/project/filter identity,
  reload and Back checks remain intact.
- `issue-625-explorer-templates.spec.ts`: extend the existing isolated-ledger pattern
  with light/dark cases for the legacy total bookmark, complete literal CSV bytes,
  privacy and no hidden valuation read after template switch/reload. Preserve the
  other templates, source-link, keyboard/scroll, custom-view and Undo assertions.
  Synthetic booking/split/audit fingerprints must remain identical.

## Remaining audited red tests: triage

- `report-consolidation-622-623.test.tsx`: the five ON failures click in-report
  segmented controls removed under #1150. `SpendingReportViews` and
  `WealthReportViews` deliberately provide no such controls ON; the report menu
  owns those transitions. This legacy control suite remains unchanged and runs OFF.
  The schema test is mode independent. No old controls are restored.
- `heute/kennzahlen.test.tsx`: eight ON failures mix obsolete OFF payday/context
  presentation with a stale fixture lacking `summary.month`. ON correctly refuses
  an unproven selected-month budget (`Kennzahlen` checks it against `scope.month`);
  the fixture therefore cannot establish a live guided-link defect. The positive,
  negative and zero guided-link contract remains in source unchanged. Keep this
  suite unchanged and run OFF for its legacy presentation assertions. Its monetary
  value/alert/derivation/guided-link assertions remain meaningful ON and require
  fixture migration under #1055, not retirement as OFF-only. #1055 still needs
  browser entry proof in its dedicated Heute/Plan lane. Do not declare #1055 done.
  A temporary diagnostic adding only `summary.month = '2026-09'` made all four
  value/alert/derivation/guided-link cases pass ON (4 passed, 6 excluded by the
  focused name filter); the file was restored unchanged after this diagnosis.

## Delivery evidence

ON: 122 tests passed across the three adapted files, `redesign-explorer-852.test.tsx`
and the domain `report-tables/tables.test.ts`. Repository typecheck, changed-file
ESLint and Prettier passed. The ON and OFF e2e builds passed.

Desktop full existing template spec: 11 passed, 4 failed. All four failures are
the existing explicit non-touch device assertions (`touchPoints: 0` expected,
`10` reported by this Windows host), after their report checks passed. The new
light/dark #1156 cases both passed, including exact download bytes. No device
assertion, timeout or tolerance was changed. Linux CI must verify those cases.
Mobile full existing template spec: 11 passed, 4 failed (three identical device
mismatches and one existing 1440-pixel year-view case exceeding its unchanged
30-second deadline). A targeted retry of that year-view case completed in 9.4
seconds and failed only the same touch-point assertion. Both added #1156 mobile
cases passed in the full run and the targeted retry. No timeout was relaxed.
Desktop and mobile privacy artifacts were inspected; screenshot animations are
disabled for the added artifact only. The five audited OFF web files passed all
103 tests, including the unchanged consolidation and Heute suites.

Local runtime: Windows, Node 24.12.0 (below the declared package engine), Chromium
156. Supported-runtime Linux CI remains required; these local results do not
replace it.

No screenshot baseline changed. The added screenshots are
artifacts only; no new Linux baseline is needed because runtime appearance is unchanged.
Existing screenshot suites remain subject to CI; owner/live acceptance stays open.

Independent read-only agent review approved the test adaptations and the final
byte-array comparison; no blocking findings. No new product decision is needed.
The bounded #1156 proof repair is separate from CI/live acceptance, and #1161's
remaining table migrations are unchanged.
