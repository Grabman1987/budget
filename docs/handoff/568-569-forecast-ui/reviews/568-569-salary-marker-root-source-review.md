# Independent root source review — salary marker proposal

Reviewed manifest 3618ca8933934f2e376146d441b1ef568836ec9f162cd4b491fa77f03ad02f0b, both complete source diffs and the new pure test. All manifest artifact hashes match.

Source finding: no blocker in the bounded proposal. Actual ForecastDay.items retains cents/kind/ref; liquidityForecast produces chronological days with no day-zero applied items. scheduledInflows uses that existing effective run, restricts the selected horizon, positive referenced income/fixed items and excludes event/sweep items. The selector uses configured salary IDs. Forecast run calls, balance calculations, low points, movement threshold and rest arithmetic are unchanged. New test keeps the literal 9000-cent salary and covers its absence from display movements plus boundary/exclusion cases.

Not approved as a runnable complete feature: the existing movements-only salaryDay test fixture needs a separately approved adapter; the required report field and whole combined feature need type/runtime checks. Existing mocked source tests found only liquidity-lowpoint.test.ts explicitly casting LiquidityReport, but this search is not a substitute for compilation. New candidate needs normal formatting on adoption. No existing tests changed, no test execution, no repository change, no deployment claim.
