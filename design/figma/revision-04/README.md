# Blueprint revision 04 — design work in progress

Owner-directed restoration of Budget's engineering identity in the existing Figma file, preserving the original reference pages and accepted product decisions.

- File: https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi
- Desktop prototype start: node `194:54809`.
- Smartphone prototype start: node `194:55058`.
- Design rules: node `197:1971`.
- Original Plan reference: node `12:2`; original system reference: `11:21`.

## Current work

All 111 previously created screen pairs were migrated to the blueprint shell. Forty-six additional pairs cover functions omitted from the earlier design. There are now **157 scenarios / 314 source frames**, plus a synchronized prototype and twelve opposite-theme comparison frames. The prototype contains 5,315 navigation reactions with no missing target. Self-navigation is deliberately omitted.

Restored native geometry includes 10/50 graph-paper titleblocks, registration crosses, dimension chains, numbered sections, parts tables and semantic hatch samples. Plan uses a compact table and contextual inspector. Booking forms use a broad two-column desktop layout, calculator and secondary details. Salary review retains date/account/sender/expectation and four inline desktop actions. The annual report has two A4 sheets; money flow has a proportional Sankey.

The user-requested cash-confirmed / bank-pending transfer rule is represented in F03. **Its application implementation is still outstanding.** Figma is not evidence of production delivery.

## Skill use and evidence

See `audit.md` for actual scoped use of Hallmark, Impeccable, UI UX Pro Max, Diagram Design and Ponytail. The existing project identity and the owner's latest teal/orange decision override generic upstream themes.

Native source checks on 314 frames found no text outside its parent. Two mobile Sankey label-box overlaps were subsequently corrected on both source and prototype. A final repeat and further representative screenshots remain pending. Screenshots already inspected include Plan desktop/mobile, salary review desktop and booking desktop. These are Figma renders, not browser or accessibility-test evidence.

All values and names are synthetic. Inputs, calculations and native file selection in the prototype are illustrative states. The unreproduced original Chrome pre-file-selection hang is not claimed fixed. Available Figma tools do not expose comment reading; known chat comments were used, not unobserved remote comments.

## Mutation history, not an installer

The scripts record the actual native Figma edits. They are **not all idempotent**. In particular, `migrate.js`, `polish.js`, `system.js` and the link-append portions must not be replayed blindly on the already revised document. Read current nodes first. A failed `use_figma` call rolls its transaction back. Successful calls persist changes in the existing file.

Applied sequence: base renderer + kit; plan; migration; extensions; modal polish; report detail; booking rebuild; remaining detail states; corrected Plan; layout/link fixes; system components; prototype sync; prototype wiring; final inline geometry fixes. The last geometry corrections shortened the two left Sankey labels to 120px and placed the two secondary desktop booking actions in one row (source/prototype/opposite theme).

Function inventory is a source-derived starting point, not an exhaustive acceptance certificate. The gap register must be checked against the final screens and interactions before declaring the design complete. No issue is closed by this design commit.
