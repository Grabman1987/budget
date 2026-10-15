# Allocation wealth stages — design extension

Eight native editable source frames and eight prototype frames extend revision 04. Existing source and prototype screens are retained. The new flow is reachable through V13 → Vermögensstufen. Figures, accounts and securities are synthetic. The workbook itself and private product/provider identifiers are not published.

| Scenario | Desktop source | Phone source | Desktop prototype | Phone prototype |
| --- | --- | --- | --- | --- |
| V18 Account universe | 253:154 | 253:357 | 260:1865 | 260:2002 |
| V19 Classes and instruments | 253:517 | 253:703 | 260:2102 | 260:2226 |
| V20 Seven editable stages | 253:846 | 253:1058 | 260:2312 | 260:2464 |
| V21 Review and conditions | 253:1227 | 253:1412 | 260:2576 | 260:2698 |

File: `Nv9oaV96Npql6onEofCFEi`. [Desktop flow](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-1865), [phone flow](https://www.figma.com/design/Nv9oaV96Npql6onEofCFEi?node-id=260-2002).

The same Blueprint title blocks, graph-paper detail, semantic light/dark variables, Archivo and Barlow Semi Condensed are retained. Fields, checkboxes and buttons are instances of existing components. New related content uses auto layout. The existing normal-field component gains stretching child constraints, and primary/ghost labels fill the button width. Desktop stage fields use two wide columns; phone uses one column. No full-UI raster is embedded.

The conditional default is deliberately labelled as a pending product decision: require managed-futures approval and confirmed liquidity/withdrawal need before activating those targets, otherwise retain the last approved stage. The implemented draft in `feat/allocation-wealth-stages` follows that proposal but is not merged or activated in production. The example does not place orders or change savings plans.

## Evidence and replay

- `validation.json` records all created IDs, the eight source/prototype mappings, and final bounds checks: zero parent text overflow or auto-layout sibling overlap on the eight source frames. Product font checks found no other families; image-node inspection found no embedded UI rasters. These are design checks, not app runtime tests.
- Visual inspection: phone account selection and desktop two-column stage form; initial text-height and checkbox-width defects were corrected before the final passing screenshots.
- `component-resize.js`: targeted shared component adjustment.
- `native-screens.js`: recovered final source builder. Prefix `const BATCH=['V18','V19'];` or `['V20','V21']`. It replaces only that named source pair; do not blindly rerun after owner edits. Prototype IDs in the table are the delivered snapshot; replacing source/prototype nodes requires updating links and the manifest.
- Prototype wiring was applied to the eight added frames and existing V13 entry actions. The 175 processed destinations resolve within the prototype page; self-destinations are omitted. Native prototype inputs remain design states, not executing app forms.

The current Figma skills (`figma-use`, `figma-generate-design`, targeted `figma-generate-library`) were loaded and applied in addition to the project's previously recorded Impeccable/Blueprint guidance. This extension does not assert that all earlier audit issues, Figma comments or all application implementation packages are complete.
