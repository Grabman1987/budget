# Settings display-control source slice — NOT VALIDATED

Refs #469, #471, #486. Base: `6420676d257698767931dd151863765cec914acf`.
Owner implementation-only direction (2026-10-22) applies: no new tests, test edits,
test runs, typechecks, builds, browser validation, CI dispatch, PR, merge or deployment.
None were performed. This checkpoint is not accepted or live delivery.

## Triage and bounded scope

The actual open issues cover app-wide terminology (#469), app-wide iconography
(#471), relocation of master-data editors (#485) and six-section settings/navigation
with immediate saves (#486). #468, recorded as #471's dependency, is closed.
#486 depends on #485. Broad master-data relocation overlaps other active writers
and is not attempted here. Prepared `9a25d927`/`e35363cb` records terminology only;
it does not provide the missing three-choice theme control. Its glossary is not
copied or reimplemented.

## Implemented source

- #469 A-19 / #486 A-11: settings display controls offer **Automatisch · Hell ·
  Dunkel**, using the existing `useTheme` store. Automatisch removes the explicit
  theme override and resumes the existing device-theme behavior. Each local choice
  applies immediately and offers Undo to its prior device preference.
- The same settings section exposes the existing amount-privacy state with a
  labelled toggle and explicit visible/hidden status. It uses the existing privacy
  store and shortcut; immediate changes offer Undo. Profile and ledger data are
  never changed by these controls.
- Existing account-preview, reminder and profile panels remain separate. Their
  existing audited server write/save behavior is retained; this source slice does
  not claim the remaining settings-wide immediate-save requirement.
- #471 D-24 groundwork: settings navigation chevrons use the prescribed 16 px,
  1.75 stroke. The new local privacy icon follows the same contract. Existing
  navigation links and accessible names stay intact.
- New display controls use existing components and token colors/type. Their touch
  targets use the existing `--touch` token and their row can wrap.

Shared-file patches are prepared outside the checkout under
`/workspace/.budget-tools/impl-settings-469-486/`: settings-only title block cleanup
(`01-settings-title.patch`, #486 A-12), and route-preserving Portfolio-Auswertung
labels (`02`/`03`, #469 A-30). The coordinating owner decides their integration.

## Acceptance still outstanding

App-wide terminology/glyph cleanup; master-data relocation and redirects; six-entry
settings navigation; settings-wide immediate save/Undo; provider status presentation;
export/backup information; full icon inventory; all desktop/mobile/WebKit, keyboard,
contrast/Axe, overflow and real browser evidence; independent source review and
ordinary required exact-head checks; authorized deployment/live verification.
The existing sidebar theme toggle is unchanged; the settings control supplies the
explicit automatic choice. No whole issue is closed or claimed complete.
