# AGENTS.md

Instructions for any coding agent working in this repository (Claude Code, Codex, others).

The complete working rules are in [`CLAUDE.md`](CLAUDE.md); they apply to every agent. In short:

1. `SPEC.md` defines scope, architecture and the precedence of all sources. Read it first.
2. `docs/ROADMAP.md` holds the task you are working on, with acceptance criteria. Ready-made task prompts live in `docs/prompts/`.
3. UI must match `design/prototype/` and `design/screens/` and follow `DESIGN.md`.
4. Calculations must match `design/prototype/*.js`; port tested logic from `reference/finance-hub/` where listed.
5. No real financial data, persons or providers anywhere in the repo. Money in integer cents. Pure domain logic with tests.
6. One task, one branch, one pull request; `npm run check` green before the PR.

## Project skill profiles

See [`docs/skills.md`](docs/skills.md) for locally adapted skills and their provenance. Read only the matching `.agents/skills/<name>/SKILL.md`: `budget-caveman` for communication, `budget-impeccable` for UI, `budget-verified-delivery` for implementation/audits, and `budget-security-review` for auth/API/migration/backup/integrations. These profiles supplement the working rules and preserve `SPEC.md` and user instructions; they do not install upstream commands.

The owner also requested original Ponytail, Impeccable, UI UX Pro Max, Hallmark and Diagram Design sources on 2026-10-15. Read the matching adapters: `budget-ponytail` for minimal-code review, `budget-ui-ux-pro-max` for focused UI research, `budget-hallmark` for design-system audits, and `budget-diagram-design` for quantitative chart review; the existing `budget-impeccable` profile covers the original Impeccable workflow. Pinned sources and actual use are recorded in `docs/skills.md`.

## Autonomous queue

Codex and other agents running issues from the queue follow `CLAUDE.md`, including its "Autonomous queue rules" section, and [`docs/queue/README.md`](docs/queue/README.md).
There is no second rule source: if this file and `CLAUDE.md` differ, `CLAUDE.md` wins.
Work on `codex/issue-N`, open a PR, never merge, and stop with `needs-human` when blocked.
