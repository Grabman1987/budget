# Blueprint revision 04 — reviewable design

The existing Figma file has been reworked across the app, using the owner's Blueprint identity and accepted product decisions. Original reference pages remain preserved. This is a design delivery, not a claim that all proposed UI behavior is deployed.

- [Desktop prototype index](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi/?node-id=194-54809)
- [Smartphone prototype index](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi/?node-id=194-55058)
- [Design rules and open limits](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi/?node-id=197-1971)
- [Plan desktop](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi/?node-id=174-2)
- [Salary review desktop](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi/?node-id=173-246)

## Scope

166 scenarios, each at desktop 1440 and smartphone 390: **332 source frames**, 332 corresponding prototype screens, two prototype indexes, and twelve opposite-theme comparisons. All 111 previous screen pairs were revised; 55 additional pairs restore omitted detail functions. The Reports hub keeps 15 entry points across four groups; [report coverage](report-coverage.md) maps all 34 existing catalog capabilities to a retained screen or detail.

Graph-paper titleblocks, registration crosses, dimension chains, numbered sections, parts tables and semantic hatches are native, editable Figma nodes. The 10/50 grid uses two compound vector paths per titleblock to keep the file responsive. Typography is Archivo with Barlow Semi Condensed technical labels. Blue is the brand; teal/orange indicate signs. Historical losses remain quiet.

Plan has a compact table, selection actions and a contextual inspector; all five section registers are reachable. Booking and salary dialogs are broad on desktop. Salary review shows date, account, sender, existing expectation and the five stable calculation sections. Four review actions share one desktop row. Smartphone inputs use 16px text, and controls retain 44px targets. The arithmetic field offers operators without a number keypad, as required by SPEC.

The freedom projection uses the existing domain output (436 months, February 2063 for the synthetic example). The loan comparison uses existing simulateLoan/compareLoanScenario: 500 EUR extra payment saves two months and 32.63 EUR interest. Values are captured beside the scripts. No application formula was changed.

Additional report details preserve forecast accuracy, a 12-month payment calendar, 36-month table, annual category heatmap, bank/interest costs and wealth attribution. Future months are empty and current months explicitly incomplete. Annual print design has two A4 sheets.

## Verification

Native source geometry: 332 frames and 16,510 text nodes, zero text outside its immediate parent and zero overlapping sibling text rectangles. The final check includes the ten additional context buttons. The final prototype has 5,658 click links plus two timed analysis transitions; no destination points outside the prototype page. Geometry/link checks do not prove every control behaves like the app.

Representative native screenshots were visually inspected: Plan desktop/mobile and opposite themes; booking desktop; salary desktop/mobile; settings mobile; expense report mobile; freedom desktop; credit comparison mobile; arithmetic field mobile; annual print sheets; annual heatmap desktop/mobile. These are Figma renders, not browser or Axe results. No exhaustive screenshot review of all 332 frames is claimed.

Actual skill application and source pins are in [audit.md](audit.md) and the project's [skills record](../../../docs/skills.md). No new agents were launched.

## Limits

- Editable inputs, calculations, native file selection and some controls are illustrative states; month arrows deliberately do not navigate to an unrelated annual view.
- The cash-confirmed/bank-pending transfer rule is designed, but its code implementation remains outstanding.
- The original Windows Chrome hang before native file selection remains unreproduced. Successful chooser/drop tests do not prove that hang fixed.
- The Figma connector exposes no comment-reading capability. Known chat comments were implemented; unread remote comments are not claimed addressed. A text clarification remains pending.
- PUB1 is excluded. Production financial records, including the owner's manual salary corrections, were untouched.

## Mutation record

The JavaScript files record actual native edits, not a one-command installer. Some are deliberately not idempotent: never replay migration, append-link or component-building scripts blindly. Inspect the current canvas first. Tool errors/timeouts rolled back their entire transaction; successful calls persisted.

Final phases: financial/calculator corrections; navigation completion; semantic polish; loan refinement; two-vector grid compression; prototype sync in batches; index/theme refresh; geometry and navigation polish; report completeness; report-entry links; final validation. Prototype root IDs and original reference URLs were preserved. Large whole-file sync timed out; `prototype-sync-batch.js` with PREFIXES and `prototype-sync-index.js` replaced it.

Inline corrections also applied: mobile modal y=68, mobile field text=16, derived fields styled as output, desktop booking secondary actions in one row, Sankey left-label width=120, title metadata width=730, and sidebar label width=120. `final-geometry-polish.js` records the repeatable geometry fixes. This source history must be read with the current Figma state and validation manifest.
