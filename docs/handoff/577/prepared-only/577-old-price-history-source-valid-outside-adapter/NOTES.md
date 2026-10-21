# OLD price-history adapter — proposal only, not adopted

Current old test calls removed asOf prop. New component needs a real useInstrumentHistory controller, defaults to EUR holding value, and draws only after a measured width. Old [data-chart-point] price dots are absent from current Drawing, so a props-only adapter would still fail every count.

Proposed fixture uses the real hook with the old fixed17.09.2026 date and Alles initial range; enters actual Kurs mode. A full typed, no-position/no-event history response is independent of the unchanged native USD quote fixture. Strict request branches distinguish the exact history query from the exact prices endpoint; unknown reads/writes are recorded before any branch and checked afterEach. ResizeObserver supplies640px actual content measurement without replacing the hook/controller/query or the component. No money/valuation calculation is mocked.

Same three old tests, all original price rows/dates, inclusive5/2/3/4/5 counts, 4,123456USD and17.09.2026 tooltip assertions, empty and503 retry assertions remain. Count selectors move from removed SVG dot attributes to the actual displayed Kurstabelle tbody rows, opened through its real disclosure. This is an explicit oracle-target adaptation, not a claim that SVG point nodes remain. Original chart-presence assertions and keyboard inspection remain. Error503 applies solely to the native quote endpoint; history remains valid and cannot hide or duplicate the quote error.

No production/test file changed, no runtime/format/types executed. Requires exact independent source review and Root/owner decision before any OLD test adoption. Native history-value coverage is a separate new547/548 task and is not inferred from this native-quote fixture.

## Independent source-validity correction

Val found original incidental history fixture impossible for a no-position/no-trade source. Corrected as actual instrumentHistory: Max has from=to17.09.2026 and one inclusive zero day; each explicit requested range retains its actual from and emits daily {unitsE8:0,valueCents:0,quality:exact,missing:null,observations:[]} through the same to, with positionnull/events[]. Use existing eachDay solely for these independent calendar rows. No quote/count/native-money expectation derives from history; quote fixture and all original inclusive5/2/3/4/5/count/native/date/error/empty assertions and real Kurs action remain exact previous candidate. Fixed allowed history URL ranges bound this incidental fixture to at most366 days.

Separate product empty-price Drawing guard stays required; this adapter does not weaken its null-chart assertion. No runtime or repository mutation.
