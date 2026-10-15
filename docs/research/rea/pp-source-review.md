# Portfolio Performance review notes

Reviewed 2026-10-15 from the authorized public clone at commit `805c20dff5d999e987675181b4f1d82f81df10c0`, whose root/app metadata identifies `0.89.1-SNAPSHOT` (master). The official download at review time was 0.89.0. The repository was read-only; no application, quote source, test suite or REST/MCP endpoint was executed, paired or enabled. No personal files were opened. Findings are in [the inventory](inventories/portfolio-performance.csv) (PP-081–110; all fields CSV-quoted, exact 11-column schema).

## Evidence and scope

Official manual pages checked 2026-10-15 include Performance Dashboard, Reporting Period, Statement of Assets and its Chart, Performance Chart/Calculation, Taxonomies/Rebalancing, Historical Prices, Price Update Status, preferences/backups, Save/Encryption and About. Relevant source symbols include `name.abuchen.portfolio.ui.views.dashboard.DashboardView`, `WidgetFactory`, `DashboardLayout`, `StatementOfAssetsView`/`Viewer`, `StatementOfAssetsHistoryView`, `PerformanceView`, `views.taxonomy.ReBalancingViewer`, `views.SecurityPriceUpdateView`, `handlers.UpdateQuotesHandler`, `preferences.BackupsPreferencePage`, and `handlers.SetCurrentViewAsInitialViewHandler`. Dashboard code groups a wide range of widget families; the manual documents the user-level options and widget interactions. Tests exist for selected areas, including `name.abuchen.portfolio.ui.tests/.../dashboard/FIREWidgetTest.java`, `DividendListWidgetTest.java`, `views/taxonomy/TaxonomyModelTest.java`, `preferences/RestApiPreferencePageTest.java`, and core performance/quote-feed tests. Tests were inspected as source only, not run; existence does not establish full UI coverage.

The review centers on report navigation/widget families, saved scopes, date and chart variants, taxonomy/rebalancing, quote and FX settings/update/error states, backup/privacy/mobile boundaries, and licenses. It does not inventory transactions, broker importers, or portfolio accounting assigned elsewhere. In the staged CSV `source_url` fields point to official help pages and immutable source links; `source_locator` identifies corresponding docs headings and source paths. `evidence_status` uses one of the canonical values (documented/source-confirmed); no runtime-observed claim is made.

## Product behavior and evidence limits

The report experience is materially richer than a generic chart page: configurable performance dashboards, named Statement of Assets table and chart views, explicit report periods, custom series, multi-account/security/benchmark comparisons, and taxonomy-based allocation/rebalancing. Statement-of-Assets chart data is daily; performance chart can aggregate daily, weekly, monthly, quarterly or yearly. Dashboard metrics are period-sensitive; the manual emphasizes that performance calculations always use a reporting period. Taxonomy rebalancing calculates proposed buys/sells from target weights and does not incorporate the user's tax or execution constraints.

The manual describes broad historical-price sources, but also warns that terms and usefulness change. The built-in provider needs an account/session refresh; current quote/subscription conditions are stated as found in the manual on review day, not guaranteed long-term. The Price Update Status view exposes per-feed statuses and errors. Currency reporting uses historical FX; missing price/FX data can affect results and risk estimates. The staged findings recommend no particular feed as permanently stable.

Backup and autosave options create local copies. The manual's encrypted-file feature protects the saved portfolio file; this review does not establish encryption for backup copies, CSV exports, plugin state or auth tokens. Mobile evidence is only the manual's stated XML-format incompatibility; it does not imply a complete mobile feature inventory or report parity assessment.

## New local REST/MCP source (not released 0.89.0 evidence)

The pinned clone includes `name.abuchen.portfolio.rest`, its preference UI, README/OpenAPI contract, and `docs/adr/0002-local-rest-api-for-scripts-and-agents.md` and `0005-authenticate-the-mcp-endpoint-with-rest-api-tokens.md`. Bundle metadata says 0.89.1.qualifier. The source/ADRs describe a loopback server off by default, per-file exposure opt-in, paired/revocable bearer tokens, explicit file-scoped routes, no API save endpoint, and a modal-dialog write gate. Those are source/docs claims about the snapshot only. Since the official download was 0.89.0, do not say those additions ship in 0.89.0. I did not enable, pair, call, or test the server; no remote claim about its security or actual runtime behavior is made.

## Licensing

The portfolio repository's `LICENSE` is Eclipse Public License 1.0. The official About page identifies the manual separately as CC BY-NC-SA 4.0. Do not copy manual prose or images into product work under the code license; this review paraphrases and links. Check individual source headers and bundled dependency licenses before reusing code.

## Boundaries

No code execution, dependency installation, private portfolio files, production services, or nonofficial product investigations occurred. External provider terms, mobile app behavior, and future release contents can change; recheck those against current primary documentation when they become implementation requirements.
