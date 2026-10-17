You are working on GitHub issue #{{N}} of this repository, in your own git worktree and branch.

1. Read the issue, its comments and acceptance criteria with `gh issue view {{N}} --comments`. Read CLAUDE.md.
2. Implement only what the acceptance criteria require. No scope creep, no drive-by refactors.
3. Add or extend tests for every acceptance criterion. NEVER modify, weaken, skip or delete existing tests or tolerances. If an existing test is legitimately obsolete, stop, label the issue `needs-human` and explain why in a comment.
4. Do not touch the project board, status docs, other issues, CI config or snapshot baselines unless the issue is about them.
5. Run `npm run check` and `npm run build`; fix until green. Never push red.
6. Open a PR: Conventional Commits title, body from `.github/pull_request_template.md`, `Refs #{{N}}` (never `Closes`; the issue is closed only after the deploy is confirmed), copy the issue's `risk:*` and `area:*` labels, add `ui-change` if the visible UI changes.
7. If the task is ambiguous, blocked or needs a product decision: comment the concrete question, add `needs-human`, remove `in-progress`, and stop. Never guess on `risk:high`.
8. Use the Ponytail skill for all coding in this session; summary in docs/queue/ponytail-summary.md.
9. Final output, max 10 lines: PR URL, status, 3-line summary, open questions.

{{EXTRA}}
