Plan › Monat restores a sticky 320px inspector from 1180px and a collapsible section below the grid on smaller screens. With no selection, Monatsüberblick is open and the other four sections are closed. The temporary Monatsdetails block is removed.

Category names select target progress, existing assignment/move/cover forms, target/history quick values, expected-payment context, the envelope history link and category lifecycle actions. Multiple selection shows combined figures and the same ordered quick-assignment action. Existing server calls, cent guards and undo paths remain unchanged. Escape/outside dismissal restores the overview; browser back retains selection and scroll. Waterfall jumps work from the multi-month grid. Other Plan registers retain their styling.

A polish pass follows the grid's chevrons, insets the waterfall stages, uses an icon close button and keeps quick values on one row.

Refs #446

Validation: web typecheck, changed-file ESLint/Prettier, CSS scale, 48 affected unit tests and web/server E2E build pass. The final six-spec desktop/mobile run passed all 23 cases (20 functional cases plus 3 setup cases), including cent-exact calls/undo, keyboard, 44px phone controls, no horizontal page overflow and light/dark Axe checks. Synthetic captures and commands: [delivery evidence](https://github.com/Grabman1987/budget/blob/feat/plan-inspector/docs/evidence/plan-inspector/README.md). The package memory exception was followed: no full local check or full E2E suite. No migration or new dependency.

Affected visual baselines: no tracked Plan-month baseline; expected/goals/report/shell layouts are unchanged. No local baseline regeneration. Required CI and pinned Linux review remain gates.

Owner steps: review the 1440px inspector and 390px collapsible layout after required CI. Package 3's phone action layout remains separate. No key/consent/migration setup and no deployment performed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
