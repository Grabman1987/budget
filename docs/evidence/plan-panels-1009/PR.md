Category and savings-goal content previously opened in side panels. Category names
now open `/einstellungen/kategorien/:id`, while Plan and Reports share
`/plan/sparziele/:id` for goal figures and history. Input forms use the existing
FormDialog on desktop and phone; the year comparison stays inline.

Refs #323 — category detail, breadcrumb/back and hidden-list context.

Refs #324 — category create/edit/group forms, including existing merge/split actions.

Refs #325 — shared goal history route with month and report return context.

Refs #326 — existing goal create/edit fields and write/undo paths in FormDialog.

Refs #327 — year event FormDialog retaining dirty/pending/error guards and focus.

Existing validation, integer-cent amounts, APIs, audit and undo remain shared. No
dependencies, migrations, provider calls or wish-purchase imports are added. Shared
edits only register routes/search/history/scroll and permit a separate synthetic
sample-server port for concurrent local verification (`E2E_SAMPLE_PORT`).

Validation: web tsc, changed-file ESLint, affected Vitest (5 files / 19 tests), and
the e2e build and changed-file Prettier passed. Desktop passed 14 distinct
functional cases across focused runs; mobile 390 px passed 17/17 including three
setup cases (28 functional viewport cases total). Coverage includes direct/back
links, scroll/context restoration, axe/no page overflow, dialog cancellation/focus,
category merge and goal/event create/edit/delete/adoption/undo/redo. Initial report
test migration defects were corrected without weakening money/source assertions.
The package-specific instruction excludes the full local check/full e2e suite;
CI remains the final gate.

Evidence: [desktop/phone captures and test notes](https://github.com/Grabman1987/budget/blob/codex/pkg-n-plan-panels-1009/docs/evidence/plan-panels-1009/README.md). No visual baselines
were regenerated. Review `sparziele-light-desktop-linux.png`,
`sparziele-light-mobile-linux.png`, `sparziele-dark-desktop-linux.png` and
`sparziele-dark-mobile-linux.png` under `e2e/goals.spec.ts-snapshots`.

Owner steps: review direct/back navigation, forms and screenshots on desktop and
390 px; review Linux visuals and required CI before merging. No keys, consents or
migrations are needed. Physical Safari and owner acceptance remain open.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
