# AGENTS.md

Instructions for coding agents working in this repository.

[`SPEC.md`](SPEC.md) defines product scope, architecture, security and financial invariants. Read it first. For roadmap work, read the task in [`docs/ROADMAP.md`](docs/ROADMAP.md); for UI work, also read [`DESIGN.md`](DESIGN.md) and the matching prototype and screens. UI text is German (de-AT); code, comments and documentation are English. Money is stored as integer cents, and calculations use shared pure domain logic.

[`docs/queue/README.md`](docs/queue/README.md) is the single source for workflow, testing, review, coordination, integration and delivery rules. Follow it for queue work. Do not duplicate its process rules here.

Project skill profiles and their provenance are listed in [`docs/skills.md`](docs/skills.md). Read only the matching `.agents/skills/<name>/SKILL.md` for the task; these profiles supplement `SPEC.md` and the queue process.

## Before every push

Working habits; the rules behind them are in [`docs/queue/README.md`](docs/queue/README.md) (section "Failures and pre-push habits").

1. Once per worktree: `git config core.hooksPath .githooks`. The hook runs `scripts/dev/pre-push-check.mjs`; its coverage and limits are listed in [`docs/development-fast-path.md`](docs/development-fast-path.md).
2. If you move, rename or remove a route, report id, `data-testid` or visible text: run `rg "<old value>" e2e apps packages` and migrate every hit in the same PR.
