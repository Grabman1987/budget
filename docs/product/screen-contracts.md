# Screen contracts and design handoff

Open semantic/design gaps are tracked as [GAP01–08](open-gaps.md). V09 includes
benchmark comparison but V02 lacks its direct comparison line; V02's index is not
an actual EUR portfolio-value graph. V01 composition is a snapshot, not complete
asset-group time development. V01's EUR net-worth graph exists and needs a bounded
visibility diagnosis if absent in the app. O01–O08 still need reviewed designs.
Node/name coverage alone must not be labeled feature/design acceptance.

Figma file `Nv9oaV96Npql6onEofCFEi`, metadata inspected 2026-10-15. These are
verified node/name references, not visually accepted screenshots. The file
contains original/archive, target area pages, a composed prototype, theme checks
and flow rules. Preserve SPEC precedence when a target frame conflicts with a
newer owner directive. A desktop frame alone is not mobile/a11y acceptance.

## Existing area references

| Product contract | Route / purpose | Specific Figma reference | Required review states |
| --- | --- | --- | --- |
| BUD02 | `/`, overview/prognosis/explanation/check | [H01 overview](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-3), H02–H05 on page `172:2` | Other month, missing forecast/valuation, no pinned items, one combined attention list |
| BUD03 | `/plan/monat`, category/selection/underfunding | [P01 month](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=174-2), P02–P06/P15–P23 on page `169:32` | Empty, selected, bulk, partial funding, stale save, undo, phone inspector |
| BUD04 | Annual/recurring/goals/payday | [P07 year](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=174-1106), P08–P12 | Missing history, versions, future/current, unapplied draft |
| BUD14 | `/monatsabschluss/$month` | [P13 checks](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=174-1864), P14 result | All five steps, saved resume, stale exception, blocked close, no lock claim |
| BUD05 | Account overview/register/reconcile | [K01 overview](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-570), K02–K09/K12–K15 | Native/EUR labels, empty/closed, pending/confirmed/checked, correction warning |
| BUD06 | Expense/income/transfer/splits | [F01 capture](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=174-2092), F02–F05/F19/F22–F25 | Zero rest, invalid share, dirty exit, linked/locked booking, queued/uncertain |
| BUD08 | Contacts and statement/receipt | [K10 contacts](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-1694), K11/F06/F18 | Open/credit/balanced history, allocation, recorded settlement, unsupported currency |
| BUD07 | Review inbox and payroll | [K07 transactions](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-1354), K08; [G01 PDF](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=173-2), G02–G11 | BOOK/PDNG, duplicate, unknown code, missing date, reject, conflicting payout |
| BUD09 | Portfolio/instrument/savings/targets | [V02 portfolio](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-2107), V03–V04/V07–V14/V17–V21; F13–F16 | Quality gate, unmanaged target, missing price/FX, overlapping version, actual execution |
| BUD10 | Net worth/debts/freedom | [V01 net worth](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-1943), V05–V06/V15–V16 | Partial history, missing terms, unsaved scenario, unreachable result |
| BUD11 | Report catalog and analysis | [R00 catalog](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=175-2), R01–R37 on page `171:373` | Shared totals, incomplete period, table fallback, print/export, missing denominator |
| BUD12 | Settings and source/rule editor | [E00 overview](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=172-3110), E01–E17 on page `172:3109` | Disconnected/expired/partial, stored/default parameters, unsafe archive |
| BUD01/BUD13 | Search, security, export, offline | [S01 search](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=173-1269), S02–S13 on page `173:1268`; E04/E05 | Login/step-up, privacy, empty/loading/error, queue uncertainty/conflict |

Related forms F07–F12/F17/F20–F21/F26 are on page `171:197`. The composed
prototype is page `194:38164`; flow-design rules are `197:1970`. These pages
are structural references, not a second authoritative set of financial rules.
Figma screen codes R07 etc. are not rule codes R07 or report positions/slugs.

## New first-use screens required

O01–O08 are proposed screen IDs defined in [onboarding](onboarding.md); no existing
Figma nodes are claimed for them. Inspected target areas/prototype contain reusable
account/category/source/global states but no named O-series financial checklist.
Create the new frames only under a separate authorized design/implementation task.

Required variants: genuinely empty, populated, migration pending, intentional zero,
save error, stale review, offline, paused/resumed, optional later, complete and
basis changed. Link every O screen to ONB01, its AC cases and existing editor.
Use existing design tokens/components; avoid duplicating a financial form inside
the checklist or adding a new primary navigation area.

## Per-screen handoff checklist

Each screen records purpose, actor/access, entry and return URL, primary/secondary
action, input defaults/validation, data source/as-of, read/write boundary, all
relevant states, disabled-action reason, focus/keyboard/announcement behavior,
phone/desktop reflow and evidence requirement. Empty copy must explain a useful
next step; financial errors cannot disappear merely by dismissing a toast.

Chart/table views expose the same values and units; actual/forecast/benchmark
line styles and non-color cues follow DESIGN. Save success, local persistence,
background pending and confirmed actual cash use different language. After undo,
refresh affected figures before presenting derived completion.

The final main integration additionally requires quiet historical negatives (with
signs/zero geometry retained), dashed debt outlines, full filtered inbox deficit
summary before pagination, proportional signed composition and a gapped daily
portfolio index. These follow the new 2026-10-15 directives; frame presence alone
does not certify that a visual reference already reflects each detail.
