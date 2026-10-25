# CLAUDE.md — Budget project instructions

Read [`SPEC.md`](SPEC.md) first. It defines product scope, architecture, security, and financial requirements. For roadmap work, read the relevant entry in [`docs/ROADMAP.md`](docs/ROADMAP.md). For UI work, read [`DESIGN.md`](DESIGN.md) and inspect the matching prototype and screens; the prototype is the visual reference.

## Product and implementation invariants

- Do not put real financial data, people, or providers in code, tests, fixtures, docs, logs, issues, or PRs. Use synthetic data only.
- Store money as integer cents. Format at the display edge (de-AT: `1.234,56 €`, real minus `−`). Keep domain calculations pure in `packages/domain` and share them rather than recomputing figures in pages.
- Never use `eval` or `new Function`; preserve the strict CSP and use the domain amount parser.
- Follow the design tokens and constraints in `DESIGN.md` / `.impeccable/design.json`. Use the glossary in `PRODUCT.md`; customer-facing UI is German (de-AT), while code, comments, and docs are English.
- Never expose secrets. Deploy tokens belong only in GitHub Actions secrets.
- Follow the security, locking, audit, undo, migration, and calculation requirements in `SPEC.md`. Do not add financial advice content.

## Workflow

[`docs/queue/README.md`](docs/queue/README.md) is the single authoritative source for queue workflow, roles, test policy, checks, review, merging, deployment, blockers, and issue closure. Follow it; do not maintain a separate or conflicting process here. It also records the binding STOP state for unattended queue loops.

Select relevant local skill profiles using [`AGENTS.md`](AGENTS.md) and [`docs/skills.md`](docs/skills.md). Profiles supplement `SPEC.md` and the queue process; they do not override them.
