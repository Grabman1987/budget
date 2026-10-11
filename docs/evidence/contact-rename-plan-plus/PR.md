Refs #427

Contacts can be renamed from the overview pencil or the statement page. The validated PATCH route changes only the name, preserves booking links, and returns the existing audit/undo group. Active duplicate names are refused atomically, including restore and forced undo/redo.

Plan month adds a category plus at each category-group end and a group action at the bottom, reusing the Settings forms and create paths. Other single-month orderings offer category creation at the bottom with the existing group selector. Empty groups remain visible, including the multiple-month table.

The shared entity and audit repositories only gain contact-specific name checks so creation, restore and undo cannot bypass uniqueness. No migration, dependency or calculation changes.

Validation: 81 affected API/repository/model/UI tests passed; DB/server/web typechecks, changed-file ESLint/Prettier, CSS scale and the single E2E build passed. Two UI files required a one-thread rerun after fork-start timeouts under load. Desktop/mobile attempts of only the added browser spec were blocked before scenarios by Windows runtime errors (`os.userInfo()`/ENOMEM and synthetic SQLite cleanup/EPERM). Browser and visual acceptance remain open for CI. Details are in `docs/evidence/contact-rename-plan-plus/README.md`. The owner's parallel-job override replaces the full local check; CI is the final gate.

Visual baselines: no tracked Plan/contact golden images were found. The affected screenshot evidence comes from `plan.spec.ts`, `plan-detail-pages.spec.ts`, `contacts.spec.ts`, `contacts-write-off.spec.ts` and `contacts-search-dev.spec.ts`. Review the new action rows, empty groups and contact pencils in CI/owner acceptance. No local baseline was regenerated.

Owner steps: review contact rename and Plan creation on the deployed desktop/390px phone UI after CI. No keys, credentials or consents are required. Do not merge until required CI passes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
