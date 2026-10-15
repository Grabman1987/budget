# Blueprint revision 04 — ongoing, not a completed design

Owner asks to restore graph paper, parts lists and engineering identity across the complete app, while retaining functions and implementing chat comments. Original reference pages remain untouched. Only synthetic data.

## Applied skills
- Hallmark audit: critical design-system drift in old `figma-app/renderer.js` shell and generic card surfaces compared with original 12:2, 25:3, 11:21 and DESIGN.md. Correction: native titleblocks, fine grid, numbered sections, dimension lines, parts positions and restrained panels. Audit was read-only; owner-authorized implementation follows separately. No claim of a full upstream pass.
- Impeccable: read `.impeccable/design.json`; use existing Archivo/Barlow, tokens and progressive disclosure. Preserve financial safeguards. The latest owner palette decision (teal/orange, blue brand) overrides obsolete red-green conventions. No new generic design system.
- UI UX Pro Max local query `form labels progressive disclosure touch target --domain ux`: three applicable rows: visible associated labels, platform-specific target sizes, 8px gaps. App target remains 44px; this is design input, not browser evidence.
- Diagram Design: common zero, literal signed values, measured labels, explicit time gaps and distinguishable actual/forecast/previous line patterns. Engineering dimension chains show provenance; decoration must not imply invented metrics.
- Ponytail: used for code review/delivery; exact-head CI and serial live gate on PR504. No extra agents.

## Function gap register — pending until designed and linked
| Area | Source | Required retained functions | Target |
|---|---|---|---|
| Plan | budget/plan-page.tsx, plan-inspector.tsx | Five layouts; 1/2/3 months; filters; selection; group/category add; collapse/pin/hidden; calculator; proposals; undo/history; nine waterfall stages; target and source-aware triage | P01–P14 + new detail states |
| Booking | ledger/capture-form.tsx | Expense/income/transfer; amount calculator; date/repeat/status; contact/account/category; note/project/income type; tracking transfer category; markers; lock/undo | F01–F06 + details |
| Accounts | ledger/account-* | Four groups + closed; stepped 90-day journal; future transactions; balance reconciliation with difference; multiselect, markers, CSV, filters; full account properties | K01–K11, F07/F20/F21 |
| Today | dashboard | Pins, four attention sources, monthly pace/cap, financial check, liquid/invested/receivable/debt provenance | H01–H04 + pins |
| Wealth | portfolio, wealth | TTWROR/IRR/benchmark; costs/distributions; allocation bands; savings plan versions; manual prices/trades; signed composition; debt scenarios; fixed-25x freedom formula and projection | V01–V08 + details |
| Reports | nav/reports-catalog.ts | All 34 capabilities in ~15 hubs, including project P&L, expected/actual income, categories, 36-month table, saved pivots, payees, personal inflation basket, payment calendar, allocation, returns heatmap/risk, two-A4 annual report | R00–R21 + details |
| Settings | settings and source components | Six groups retaining data-source mapping/sync/consent, profile/household/privacy, rules stages/history, projects, asset classes/bands, inflation basket, passkeys/recovery/reauth | E00–E06 + details |
| Salary | payslip flow | Wide direct review, five stable calculation sections; only unknown codes ask; payout date/account/Von/expectation; no duplicate; four desktop actions inline; mobile targets; validation/error states | G01–G11 |

## Evidence limits
Figma native screenshots and graph checks are design evidence only. No real PDF or account data. Original Chrome pre-file-selection hang is unreproduced and not claimed fixed. Figma comment access is unavailable in current tool set; chat comments are included. Prototype is being resynchronized after source screens change.
