Contact statements and global search results now open as deep-linkable pages. New contacts use the existing FormDialog. The component gallery and developer harness demonstrate detail routes and input dialogs, and the obsolete example panel entry is removed.

- Refs #321: `/konten/kontakte/:id`, breadcrumbs/back navigation, retained balanced-history context and legacy `?kontakt=` links. Existing receipt, settlement and audit/undo APIs are reused.
- Refs #322: contact creation in FormDialog; cancel, fresh reopening and focus return.
- Refs #338: `/suche?q=…&von=…`, Ctrl K, keyboard result navigation, recent ranking, privacy, retries and shortcut help. The search provider is unchanged.
- Refs #339: dev/e2e-only `/dev/details`; remove `beispiel` from PanelHost/registry while retaining real input editors and shared primitives.
- Refs #340: gallery and harness use the example detail route and input-only dialogs. Long input content still exercises scrolling and focus containment.

The shared change in PanelHost restricts capture account context to `/konten/:id`; contact/inbox detail IDs must never preselect an account. Router changes only add routes. No dependency, schema, calculation, provider, auth or automatic booking changes.

Validation and synthetic desktop 1440/mobile 390 captures: [package evidence](https://github.com/Grabman1987/budget/blob/codex/pkg-m-contacts-search-dev-1009/docs/evidence/contacts-search-dev/README.md). The owner's parallel-job exception was followed: scoped TypeScript, changed-file ESLint/Prettier, affected Vitest files and selected changed E2E specs with one worker; no full check/suite. CI remains the final gate.

No visual baseline was regenerated. Review all four `e2e/components.spec.ts-snapshots/bauteile-{light,dark}-{desktop,mobile}-linux.png` files, plus shell/application baselines containing the desktop header search control. Contact/search evidence captures are not pixel baselines.

Built on PR #406's inbox branch. Integrate #406 before this PR. Owner steps: review CI/Linux visual differences and verify the new navigation and dialog cancellation/focus on the physical phone. No keys, consents or migration are required. Do not merge before the required checks and review.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
