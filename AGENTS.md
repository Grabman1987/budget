# AGENTS.md

Instructions for coding agents working in this repository.

[`SPEC.md`](SPEC.md) defines product scope, architecture, security and financial invariants. Read it first. For roadmap work, read the task in [`docs/ROADMAP.md`](docs/ROADMAP.md); for UI work, also read [`DESIGN.md`](DESIGN.md) and the matching prototype and screens. UI text is German (de-AT); code, comments and documentation are English. Money is stored as integer cents, and calculations use shared pure domain logic.

[`docs/queue/README.md`](docs/queue/README.md) is the single source for workflow, testing, review, coordination, integration and delivery rules. Follow it for queue work. Do not duplicate its process rules here.

Project skill profiles and their provenance are listed in [`docs/skills.md`](docs/skills.md). Read only the matching `.agents/skills/<name>/SKILL.md` for the task; these profiles supplement `SPEC.md` and the queue process.

## Before every push

These are working habits, not a second process; [`docs/queue/README.md`](docs/queue/README.md) still governs delivery.

1. Once per worktree: `git config core.hooksPath .githooks`. The hook runs `scripts/dev/pre-push-check.mjs` (typecheck, ESLint/Prettier on changed files, related unit tests, and a check for removed identifiers that e2e specs still reference).
2. If you move, rename or remove a route, report id, `data-testid` or visible text: run `rg "<old value>" e2e apps packages` and migrate every hit in the same PR. A spec must never point at something that no longer exists.
3. After a red CI run, classify the failure first (contract, flake, infrastructure), fix that class and push once. If the same job fails twice for the same reason, stop and record cause and evidence in the issue instead of pushing a third attempt.
4. In new specs, do not assert layout values exactly; allow sub-pixel tolerance (for example `>= 43.5` for a 44 px target).
