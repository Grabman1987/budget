# Toolkit for YNAB reference analysis

Research date: 2026-10-15. Official project: [Toolkit for YNAB](https://www.toolkitforynab.com/), which links [the community repository](https://github.com/toolkit-for-ynab/toolkit-for-ynab). Inspected source: `631c914714e747e0b4478e3ac521057761622bcd`, default branch `develop`, package and manifest version `3.23.0`. This pins a source snapshot, not the version installed in any browser or currently distributed by an extension store.

The [individual option inventory](inventories/toolkit.csv) records stable `TK-<source setting name>` identifiers, source locations, defaults, variants, behavior/dependency notes and classification. Rows describe source-confirmed definitions unless explicitly narrowed. A selectable mode is retained under its owning setting; multiple settings in one file are separate rows. Hidden/system definitions must be distinguished from active user options.

## Purpose, workflow and host dependency

Toolkit adds optional changes to the YNAB web app. It is not an independent budget ledger, bank backend or native investment application. Users configure extension options, then see affected YNAB views or the added Toolkit reports. Budget should adopt useful concepts through its own shared model and design rather than embed a YNAB patch layer.

The inspected README declares maintenance mode and less frequent maintenance releases. The source depends on YNAB route names, DOM selectors, Ember entities and internal calculations. `src/extension/features/feature.ts` owns invocation, route/budget changes, observers, CSS injection and cleanup hooks. A source option can exist while a changed YNAB host prevents it working. No Toolkit extension was installed or enabled in the owner's authenticated budget; source confirmation is not runtime compatibility proof.

The manifest matches YNAB domains and requests extension storage. Settings are managed in `src/core/settings/` and `src/core/common/storage/`. `scripts/generateSettings.js` discovers `settings.{js,ts}`, flattens array definitions, validates required keys/types and excludes `hidden: true` entries from generated settings. `src/core/content-scripts/feature-setting-validation.ts` validates names, booleans, select variants and color syntax. No upstream build script or package installation was executed for research.

## Classification and relation to YNAB

| Class | Examples / purpose | Adoption boundary |
| --- | --- | --- |
| Visual | Density, widths, fonts/colors, hidden help/banners, row emphasis | Evaluate readability/accessibility in Budget's existing tokens; no independent financial calculation |
| Workflow | Category filtering, transaction navigation, selection/split controls, keyboard behavior, confirmation safeguards | Reuse Budget's routes, strict parser, explicit forms and durable undo |
| Financial insight | Buffering, pacing, target/balance checks, income history, added report calculations | Specify denominator, scope, date window, missing-data and precision before adoption |
| Privacy/portability | Amount obscuring, copy/print/report export | Reuse amount privacy and authorized export; copying personal clipboard data is not part of this research |
| Extension control | Global disabling, diagnostic or report navigation options | Not a household product feature in Budget; retain only where needed for its own settings architecture |

Classification is analyst interpretation of source-defined behavior, not an upstream promise or proof of financial correctness. The inventory states each setting's relationship to the YNAB behavior it augments.

## Data and integration model

The extension reads the host's accounts, transactions/subtransactions, categories, monthly category calculations and plan metadata. It has its own settings/report UI state but no authoritative replacement for those financial entities. Setting values are preferences; they must not be confused with bookings or budget assignments. Some features only change CSS, while others invoke host actions or derive figures from host data. Report export/printing is a downstream view of YNAB data, not restoration or a generic banking interface.

For Budget, an accepted derived metric belongs in `packages/domain` or a documented server read model, used consistently by Heute and Reports. A visual preference belongs in the existing profile/UI preference route. Do not reproduce direct DOM scraping, global host entities or a second calculation in the React page.

## Source calculations and tests

The [calculation audit](toolkit-calculations.md) records algorithms, exact source paths/lines and test boundaries for buffering, pacing, date of money, custom averages, card assistance, report filtering, cashflow, net worth, historic/outflow forecasts and bulk actions. The [independent source review](toolkit-source-review.md) records registry, host, storage and design constraints.

The most consequential inspected example is buffering: `budget/days-of-buffering/index.js` divides eligible budget-account money by average daily outflow, with selectable credit-card exclusion. Its selected month count is approximated as months × 30, while the denominator depends on the first/last eligible spending dates; its minimum history condition counts distinct spending dates. These semantics differ from a calendar-normalized reserve runway and from YNAB Age of Money.

Other differences must remain explicit:

- Custom average assignment divides by months with matching transactions, not every configured lookback month; months with no activity do not reduce the average.
- Pacing compares signed activity against pre-spending funds and current calendar progress. Budget already has a separately governed shared pace/read model.
- Net worth first accumulates account history before slicing the requested display period; positive/negative balances define asset/debt amounts. A date-range-only transaction sum would be wrong.
- Balance-over-time projections use approximate recurrences including 15-day twice-monthly intervals; those are not a substitute for Budget's effective schedule rules.
- The Toolkit forecast resamples historical weekly flows into 100 paths over 520 weeks. Its terminal sorting and random sampling do not establish a guaranteed outcome or a financially validated confidence band.
- Copy Transactions writes tab-separated clipboard data; print support is CSS. Neither is a full application backup or a custom PDF engine.

Synthetic probes: 60,000 cents eligible money and 2,000 cents/day outflow imply 30 days; omitting a negative card balance raises that numerator and changes meaning. Three configured months with two 12,000-cent spending months and one empty month give Toolkit's activity-month average 12,000, whereas a calendar-month average is 8,000. A proposed Budget mode must name which behavior it adopts and why. Zero/absent denominator, negative cash, transfers and incomplete history require explicit states.

Source/test presence is not a passing test result. Checked-in report normalization, schedule projection, historical-outflow and stochastic-forecast tests were inspected; several feature calculations have no dedicated test file. No live host integration test, build or private financial calculation was executed by this research.

## License and reuse

The inspected root [LICENSE](https://github.com/toolkit-for-ynab/toolkit-for-ynab/blob/631c914714e747e0b4478e3ac521057761622bcd/LICENSE) is MIT; its notice is retained in [toolkit-MIT.txt](licenses/toolkit-MIT.txt) for registry descriptions/metadata excerpts. Future copies/substantial portions must retain that notice. Dependency assets, fonts, libraries and YNAB interfaces require their own provenance check; the root license is not a blanket license for all host software. The task copies no product implementation into Budget.

## Coverage gate

Closed on 2026-10-15 after the enumeration, functional-source audit and independent source/design review:

| Area | Covered evidence | Limit |
| --- | --- | --- |
| Every discovered settings definition | 107 unique definitions in 101 `settings.js` files; defaults and all variants retained, including 25 select settings | Definition presence does not establish live compatibility |
| Active versus hidden | 100 generated settings; seven hidden definitions excluded by upstream generator | No deprecated/system marker found; hidden is not synonymous with supported active control |
| Generated feature list | 96 headings reconcile to their active sections; four active `toolkitReports` settings omitted by the doc generator's fixed section list | The list is not a complete settings count |
| Report subfunctions | Nine distinct report routes/implementations added as separate subfeature rows | They depend on parent ToolkitReports and are not nine separate enable settings |
| Algorithms/models/tests | Focused [calculation audit](toolkit-calculations.md), checked-in relevant tests and [independent review](toolkit-source-review.md) | No tests/build/live extension run; full host behavior not exercised |
| Settings/storage/import-export/recovery | Local settings, migration/validation, disable paths, copied/printed report data and host coupling inspected | No independent bank sync/restore service; failure recovery is extension/host specific |
| Securities/multi-currency | Host account/transaction report scope inspected | No evidence here of a standalone securities/FX ledger; do not infer comprehensive absence beyond inspected source |
| License | Pinned MIT notice retained; third-party dependency provenance identified | Dependency-by-dependency reuse not approved by this analysis |

The final inventory has **116 rows: 107 setting definitions plus nine report subfeatures**. The [coverage sidecar](toolkit-coverage.txt) makes the enumeration boundary reproducible. Hidden definitions remain in the inventory with explicit exclusion status so they cannot silently become recommended active features. Financial, workflow and purely visual changes are classified separately; conditional relationships remain visible.

Relevant functions are now documented for synthesis. Runtime availability of each individual extension option remains unverified, and current native YNAB progress/views/summary behavior can overlap Toolkit definitions. This source-bounded closure does not claim all extension options work in today's host. Next product: Actual Budget.
