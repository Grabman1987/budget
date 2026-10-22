# #488 answer-first report source handoff — NOT VALIDATED

Base: `4f50e612fed8d812ae054470a3e31ab9553e2732` (latest reports source supplied for this work). This branch changes presentation source only. No tests, typecheck, build, browser capture, Axe, CI, PR, merge, or deployment were run.

## Existing implementation retained

The base already contains the shared report answer presentation from #553/#554, report frames and period control, chart accessibility work from #555, and print work from #556. This source patch leaves those implementations, the report catalog, API readers, financial formulas, writes, locks, and undo paths unchanged.

## Focused source changes

- Depot comparison charts now receive the same indexed-value Y domain, drawn from the existing depot and benchmark series. Their axes become directly comparable; gaps and exact tooltips remain as before. Method prose is behind native disclosures.
- Kategorieübersicht first shows up to five largest absolute changes against a complete prior period. The strongest changed category becomes the initial trend selection; an explicit URL selection still wins. Values come from the existing overview row sums and previous-period cents. Method prose is collapsible.
- Gehaltsreport starts with the regular monthly net amount and its chart. The lead reads the same regular-only timeline as the chart; special payouts and reimbursements remain visible in the following existing payout breakdown. The salary chart uses the observed data range rather than forcing a zero baseline. The captured-slip history is a table with the existing detail links. Ratio methodology is collapsible.

## Integration and acceptance still open

- Integrate against the newer #470 axis/table source separately. Inspect overlap in shared `PerformanceChart`, `category-report.tsx`, and the report styles; carry the newer chart/accessibility behavior forward. Preserve #555 chart alternatives and #556 print rules.
- Review the selected five reports at 1440 desktop, 390 Chromium mobile, and WebKit iPhone, including both themes, Axe, horizontal overflow, 44 px touch targets, missing data, long category names, regular/special salary months, and the depot charts' identical ticks. Verify the chart data table path after integration.
- Run the repository gates and capture synthetic desktop-light/iPhone-dark evidence. Only then assess all issue criteria and prepare an English PR description ending `Refs #488`.

This handoff makes no acceptance or screenshot claim.
