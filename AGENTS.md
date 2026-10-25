# AGENTS.md

Instructions for coding agents working in this repository.

[`SPEC.md`](SPEC.md) defines product scope, architecture, security and financial invariants. Read it first. For roadmap work, read the task in [`docs/ROADMAP.md`](docs/ROADMAP.md); for UI work, also read [`DESIGN.md`](DESIGN.md) and the matching prototype and screens. UI text is German (de-AT); code, comments and documentation are English. Money is stored as integer cents, and calculations use shared pure domain logic.

[`docs/queue/README.md`](docs/queue/README.md) is the single source for workflow, testing, review, coordination, integration and delivery rules. Follow it for queue work. Do not duplicate its process rules here.

Project skill profiles and their provenance are listed in [`docs/skills.md`](docs/skills.md). Read only the matching `.agents/skills/<name>/SKILL.md` for the task; these profiles supplement `SPEC.md` and the queue process.
