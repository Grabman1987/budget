# Remaining report target content (#487)

Base: checked/live main `4696066ebd9c14c0ae80dbbbcd338266580d7c35`.
This is a source-only target-content package. #487, #620 and PP acceptance #356
remain open; there are no redirects or new financial calculations.

## Requirement and implementation boundaries

- Income's canonical catalog/loader/phone/document title is “Einnahmen und
  Cashflow”. Its existing three views remain; `darstellung=projekte` adds the
  complete existing global `ProjectsReport`, including archived projects,
  household side income, unassigned income, per-project bookings and monthly
  results. It uses `projectsReportQuery(period)` unchanged and retains the
  `projekte` verdict identity. Its months follow that reader, including its
  existing explicit-calendar-range behavior; they are not replaced by Income's
  month semantics.
- Global project results never silently broaden `projekt`. Any selected ID,
  including an unavailable/deleted one, keeps its URL and shows an explicit
  scope explanation instead of global content. Malformed IDs retain the
  existing invalid-filter branch. The existing explicit “Alle Projekte zeigen”
  action clears the filter. Sources/drilldown behavior remains unchanged.
- Canonical `pallocation` has the catalog/loader/body title “Portfolio-Auswertung”
  and three owner-named views: Rendite & Risiko (`rendite`), Verteilung über Zeit
  (`verteilung`, default retaining the existing allocation landing body), and
  Einzahlungen und Wert (`einzahlungen`). They reuse the complete performance,
  allocation and contribution readers. Original report IDs remain the verdict
  source; bodies and financial/quality formulas are unchanged.
- Allocation keeps its existing `/api/portfolio/allocation-report` as-of and
  history contract, with no invented period parameter. Performance retains
  `period`, `view=securities`, `history=performance`, `provenance=valuation-v1`;
  contributions retain `period`, `view=securities`, `history=contributions`.
  Benchmark choices, monthly grids, calculation/source disclosures, missing
  data, lifetime gains and the distinction from depot cash remain in their
  existing readers. The contribution trend opt-in also works under the
  canonical route.
- View switches merge existing search state. The parser adds only the four new
  view values; exact-window `exakt` true/`'true'`, server saved-view `ansicht`,
  project validation and the existing representation union remain. Saved-view
  storage, CAS, APIs and writers are untouched.
- All standalone old routes and their bodies remain. #620 owns eventual aliases,
  redirect/query contracts and all-34-slug acceptance. The owner’s PP comparison,
  shared benchmark acceptance and physical-device acceptance are not established
  by this source package.

## Evidence and verification

New mandatory unit spec: `remaining-target-search-487.test.ts` (four parameterized
search-state cases plus canonical catalog/legacy identity assertions).
New `issue-487-remaining-target-views.spec.ts` matches the existing desktop/mobile/
WebKit issue-spec patterns without configuration changes:

- Real isolated ledger, August 2026: project income 300003 cents, costs 30000,
  result 270003; household side income 350006, unassigned 50003. Selected project
  A remains 100001 cents before and after backing out of the global view. The
  complete global body/verdict equals `/reports/projekte` in the same window;
  archived attribution, invalid/deleted IDs, reload, URL state and privacy checked.
- Three sample-reader parity cases compare the entire existing body and source
  verdict to the canonical view for the same `1J`, including real allocation,
  benchmark/return history and contribution data. Contribution trend paths are
  required when `trend=true`.
- Fixed reader payload: 100001 start + 20002 flows + 30003 gain = 150006 end,
  TTWROR 12.3%, annualized 45.6%, XIRR 12.1%, lifetime gain 691 cents, exact
  2026-08-01..2026-08-31. Actual request query/provenance, hide → switch → masked
  known money/verdict/no clear accessible text → unhide, and back/query retention
  are asserted. This is a presentation fixture, not a PP comparison result.
- Both themes, full Axe, no page overflow, phone 44px view controls and PNGs are
  prepared. No skip, timeout extension, snapshot update or old oracle edit.

All old test files, readers' API queries and financial engines are unchanged.
Shared overlaps for integration review: `report-search.ts` representation union,
`reports-catalog.ts` two canonical names, `reports-pages.tsx` dispatch/trend context.
Reader edits are optional controls and the Project hero comma glyph. A scoped
Portfolio title rule shows the full canonical heading on desktop. The monthly
contribution table retains every value and uses its existing keyboard-scroll
region with single-line date and amount cells. No redirect or new writer exists.

Independent capable full source review and later bounded visual delta review
cleared the source for runtime (`private/487-remaining-final-review.md`,
`private/487-remaining-visual-delta-review.md`). First focused
[40632840717](https://github.com/Grabman1987/budget/actions/runs/40632840717)
passed 38 browser cases plus three setup cases; three new global Project cases
failed because the test URL omitted its August month. The fixture's existing
household side income and literal cents were retained. The scoped URL correction
passed all three profiles in
[40633683222](https://github.com/Grabman1987/budget/actions/runs/40633683222),
three browsers plus three setup cases. An independently reviewed mechanical
format patch was applied. Actual screenshots from that stage revealed the
truncated desktop canonical Portfolio title and wrapped phone monthly cells;
the bounded CSS and geometry/keyboard corrections were then reviewed.

Combined affected [40634964847](https://github.com/Grabman1987/budget/actions/runs/40634964847)
passed all 15 new browser cases and three setup cases, plus seven passed tests
in the old contribution invocation, first attempt. Restored-source, lint, typecheck,
build and discovery flags were green; the workflow was red only for formatting
of the new E2E file. An independently reviewed exact mechanical patch was
applied. The corrected image packet
[40635676194](https://github.com/Grabman1987/budget/actions/runs/40635676194)
passed four affected cases in desktop and WebKit, both themes, and retained
16 actual PNGs in `private/487-visual-40635676194/`. Root and a separate
read-only reviewer visually cleared the eight selected desktop-light and
WebKit-dark view images in `docs/evidence/reports-remaining-targets-487/`.
The keyboard-focused phone capture includes a visible skip link, so no claim
of an unobstructed full-page viewport or physical-device acceptance follows.
Checked-main integration remains before a public PR and its required exact CI.
No local Node/npm/tests/build/browser/formatter ran because of host RAM.
