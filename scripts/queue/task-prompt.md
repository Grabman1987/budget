You are working on GitHub issue #{{N}} of this repository, in your own git worktree and branch.

1. Read the issue, its comments and acceptance criteria with `gh issue view {{N}} --comments`. Read CLAUDE.md and docs/queue/README.md.
2. Implement only what the acceptance criteria require. No scope creep, no drive-by refactors.
3. Add or extend tests for every acceptance criterion in NEW test files or new cases. NEVER edit, weaken, skip or delete existing tests or tolerances, never loosen a tolerance, disable a lint rule, lower coverage or remove a check. If an existing test must change, do not touch it: list each file, the change and the reason in the PR body under "Needed test changes". The orchestrator decides under the owner's test-change policy.
4. Do not touch the project board, status docs, other issues, CI config or snapshot baselines unless the issue is about them. Never edit `docs/queue/`, `scripts/queue/`, `playwright.config.ts` or `vitest.config.ts` unless the issue is about them.
5. Run `npm ci` once (fresh worktree). Before every push and after merging main into your branch run the cheap targeted checks: `npm run typecheck`, `npm run build:e2e` for UI changes, and only the affected or new specs (`npx playwright test e2e/<spec>.ts`, `npx vitest run <file>`). Finish with `npm run check` and `npm run build`. Full CI is the final gate, not your debugger. Fix until green; never push red.
6. Open a PR: Conventional Commits title, body from `.github/pull_request_template.md`, `Refs #{{N}}` (never `Closes`), copy the issue's `risk:*` and `area:*` labels, add `ui-change` if the visible UI changes. Never add `queue:complete` or `tests-change-approved`: only the orchestrator sets them.
7. If the task is ambiguous, blocked or needs a product decision: comment the concrete question, add `needs-human`, remove `in-progress`, and stop. Never guess on `risk:high`.
8. Use the Ponytail skill for all coding in this session; summary in docs/queue/ponytail-summary.md (read it, never edit it).
9. Never merge. Final output, max 10 lines: PR URL, status, 3-line summary, needed test changes, open questions.

{{EXTRA}}
