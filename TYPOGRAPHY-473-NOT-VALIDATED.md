# #473 typography residuals — NOT VALIDATED

Pinned base: `c16eb406451e3aa31c6afcb2abcf5018af408a6e` (latest #489 + #471 + ledger source). This is a bounded source checkpoint, not issue acceptance or a release.

## Existing implementation retained

The prepared-work inventory and `473474-current-public-acceptance-audit.md` identify the earlier DS2 implementation (PR #533). The current base already has generated T1–T12 size/line-height tokens, desktop 15px / phone 16px body, global Archivo/tabular numbers, and the CSS scale guard. The guard accepts declared `--fs-*` sizes or native-control `inherit`, rejects literal sizes and restricts the revision token to the documented dark-only selectors. No typography-system rebuild, token generation, validator rewrite or additional exception is warranted.

A source search of current app/shared CSS found no remaining literal font-size declarations outside allowed inheritance. This is source inventory, **not an executed scale-check result**. The single legacy SVG `fontSize={14}` presentation attribute is removed; its class already supplies the canonical size. Generated scale definitions, DESIGN.md and checker source are unchanged. The 11px revision token remains unused by application selectors; there is no new use or exception.

## Bounded source changes

Several concrete data values still inherited Barlow from the shared SVG label classes: chart endpoint amounts, low-point amounts, totals, inflation index/count results, Sankey amount/share lines and dimension-chain amounts. The additive `.svg-value` role sets Archivo (`--font-ui`), `tabular-nums` and neutral tracking while preserving each existing size/colour class. Existing axis/marker labels and label-only allocation/Sankey names retain their technical face. The amount-expression result and Plan's remaining-to-distribute money also use Archivo/tabular numbers. `ElevationMark.valueLabel` opts the actual Heute low-point amount into this role; label-only callers retain their prior role.

No financial expression, integer-cent value, masking, data source, projection, write, audit, lock, Undo, chart coordinate, path geometry, interaction target, focus behavior or existing selector/test is changed. Font metrics can nevertheless affect visual text width, so fit/overlap is not established by these source edits.

## Integration seams — use hunks, not whole newer files

The branch has small class/prop hunks in the following potentially newer crossbranch files. Preserve all later UI/data/financial changes when adopting them:

- `apps/web/src/budget/plan.css`: only `.dist-left` financial text family/tabular/tracking; preserve #591–#593 and later Plan CSS.
- `apps/web/src/heute/charts.tsx`: only `valueLabel` on the low-point `ElevationMark`; preserve later Heute reader/transport/close work.
- `apps/web/src/pages/portfolio-allocation-report.tsx`: only the central total's `svg-value` class; leave group/class labels alone and preserve newer report/allocation code.
- `apps/web/src/reports/{assets-debts-chart,contracts-report,finanzcheck-report,liquidity-chart,month-charts,personal-inflation-report,table-charts,wealth-history-chart}.tsx`: only actual value-node classes; preserve newer report catalogs, drilldowns and math.
- `apps/web/src/ledger/balance-chart.tsx`, `apps/web/src/charts/{pace-chart,sankey-chart}.tsx`, `apps/web/src/routes/bauteile-charts.tsx`: value-node classes only, no underlying model/format/masking changes.
- Shared `packages/ui/src/styles/charts.css`, `styles/components.css`, `charts/elevation-mark.tsx`, `components/dimension-chain-drawing.tsx`: add the value role/optional opt-in and preserve existing labels/selectors/geometry. Removing the obsolete SVG literal needs no new size token.

A separate newer-branch literal exists in #516 checkpoint `935f685baa16590c1e24c356401eacc926a97a32`, outside this pinned base: `apps/web/src/inbox/bank-source-explanation.css` has `font-size: .875rem` on explanation prose. At integration replace only that declaration with `font-size: var(--fs-body)` (T6 explanatory prose, responsive 15/16px). Do not overwrite the newer inbox files or alter the frozen #516 branch wholesale. Exact one-hunk patch supplied to the coordinator at `/workspace/.budget-tools/cloud-control/473-typography/crossbranch-516-css.patch`. Other source branches require a fresh residual inventory at integration; this checkpoint does not claim coverage of source absent from its base.

## Deferred validation

Per the owner's 2026-10-22 implementation-only direction, no tests/new tests/test edits, typecheck, build, browser, CSS check, formatter/checker execution, CI, PR, merge or deployment occurred. No dependencies or evidence were installed/copied. Existing tests, snapshots, checks and financial protections remain unchanged.

Later validation must retain the old financial oracles and cover actual loaded Archivo/tabular computed styles, unchanged axis/label roles, canonical minimum sizes, 1440/390/genuine WebKit layouts, long signed/native amounts, chart/chain text fit, amount privacy, full Axe in both themes and actual 44px touch/focus behavior. In particular font-family changes can affect dimension-chain placement estimates and low-point shelf measurements; source inspection cannot establish their rendered fit. Reuse the existing `packages/ui/src/css-scale.test.ts`, chart/dimension-chain suites, `e2e/css-scale.spec.ts` and current chart/Plan/Heute browser coverage without weakening assertions or changing baselines merely to pass. The earlier outside typography proof drafts and historical evidence were inventoried, not adopted or executed.

Workflow trigger source was read: CI pushes only main; remaining workflows are PR/manual or deploy after main CI. A normal push of this isolated branch is a checkpoint only, with no PR or validation claim. #473 remains open.
