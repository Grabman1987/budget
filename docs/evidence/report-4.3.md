# Report 4.3 — contributions and value

The connected securities-only report uses the existing valuation and portfolio-flow read, including monthly boundaries and calendar-year intersections. It shows start value + signed net flows + gain = end value. Fully sold positions retain their history. Missing prices or FX refuse the complete read; no depot-cash, savings-plan or R12 funding attribution is inferred.

Focused validation: 17 invest API cases and seven desktop/mobile browser cases, including setup, real synthetic API comparison, period changes, full sale, unavailable history and exact safe-integer display boundaries. The shared display balancer is checked before euro precision; out-of-range rounding or residue adjustment uses exact cents. The actual maximum safe cent value and negative-tie/residue cases are retained in tests.

Original blueprint captures cover light/dark at 1440 and 390 pixels. Scrollable chart/table regions retain the actual mobile viewport width; signed changes use the soft negative color and actual-value lines remain solid. Keyboard and accessibility checks accompany literal financial assertions.

Independent financial review corrected a zero-length prior-year row, shared month counting, unsafe exposed cent values and three rounding/display boundaries. This is not a full overflow audit of the inherited valuation engine. Depot-cash coverage, funding-source attribution and private reconciliation remain open. Integrated checks and actual publication are recorded separately by the release process.
