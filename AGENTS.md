# AGENTS.md

Instructions for any coding agent working in this repository (Claude Code, Codex, others).

The complete working rules are in [`CLAUDE.md`](CLAUDE.md); they apply to every agent. In short:

1. `SPEC.md` defines scope, architecture and the precedence of all sources. Read it first.
2. `docs/ROADMAP.md` holds the task you are working on, with acceptance criteria. Ready-made task prompts live in `docs/prompts/`.
3. UI must match `design/prototype/` and `design/screens/` and follow `DESIGN.md`.
4. Calculations must match `design/prototype/*.js`; port tested logic from `reference/finance-hub/` where listed.
5. No real financial data, persons or providers anywhere in the repo. Money in integer cents. Pure domain logic with tests.
6. One task, one branch, one pull request; `npm run check` green before the PR.
