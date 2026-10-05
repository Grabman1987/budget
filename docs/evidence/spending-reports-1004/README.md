# Spending report review evidence

All screenshots use the repository's synthetic sample server. No private finance source was read. These are review artifacts, not Playwright screenshot baselines. Desktop is 1440 × 900; touch Chromium is 390 × 844. Light and dark captures are included; physical iPhone acceptance remains with the owner.

| Report | Desktop light | Mobile light | Desktop dark | Mobile dark |
| --- | --- | --- | --- | --- |
| Geldfluss | [Desktop](geldfluss-light-desktop.png) | [Mobile](geldfluss-light-mobile.png) | [Desktop](geldfluss-dark-desktop.png) | [Mobile](geldfluss-dark-mobile.png) |
| Income versus Expense | [Desktop](income-expense-light-desktop.png) | [Mobile](income-expense-light-mobile.png) | [Desktop](income-expense-dark-desktop.png) | [Mobile](income-expense-dark-mobile.png) |
| Personal inflation | [Desktop](personal-inflation-light-desktop.png) | [Mobile](personal-inflation-light-mobile.png) | [Desktop](personal-inflation-dark-desktop.png) | [Mobile](personal-inflation-dark-mobile.png) |
| Bank and interest costs | [Desktop](bank-costs-light-desktop.png) | [Mobile](bank-costs-light-mobile.png) | [Desktop](bank-costs-dark-desktop.png) | [Mobile](bank-costs-dark-mobile.png) |

On mobile the Sankey and monthly tables scroll inside their labelled regions. The month-cell drill was exercised by a real pointer click as well as CSV export and category expansion. Glossary terms were checked through focus, Escape and tapping.

Baselines to review in Linux CI: Heute light/dark desktop/mobile (forecast copy and early-month provisional state), Reports catalog/shell desktop/mobile (new 1.10 entry and navigation order). Reports with standalone screenshots now have new compositions for 1.4, 1.10, 2.3, 2.4, 2.5, 2.6, 3.4 and 3.5; their review captures are evidence, not regenerated baselines.
