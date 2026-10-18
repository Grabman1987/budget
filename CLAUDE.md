# CLAUDE.md — working rules for Budget

Private household finance PWA for one user. Read `SPEC.md` first; it defines precedence of all other sources.

## Before you change anything

1. Read `SPEC.md` (scope, architecture, gates) and the task's entry in `docs/ROADMAP.md`.
2. For UI work read `DESIGN.md` and open the matching page in `design/prototype/` and `design/screens/`. The prototype is the reference; match it. Do not invent a new look.
3. For calculation work read the matching function in `design/prototype/*.js` and, if listed, the module in `reference/finance-hub/`. Port behaviour, write tests first.

## Hard rules

- **No real financial data, persons or providers** in code, tests, fixtures, docs or commits. Use the synthetic ledger (`packages/fixtures`, ported from `design/prototype/reports-core.js`). Persons are contacts, providers are institutions: both are data.
- **Money is integer cents.** Never floats for stored amounts. Format only at the edge (de-AT: `1.234,56 €`, real minus `−`).
- **Domain logic stays pure** in `packages/domain` (no DB, no DOM) with unit tests. Pages call domain functions; the same figure is never computed twice in different places.
- **No `eval`/`new Function`**, strict CSP. Arithmetic in amount fields uses the parser in the domain package.
- **Design:** blueprint tokens only (from `DESIGN.md` / `.impeccable/design.json`). Red only for action needed; pastel green/red only for heatmaps and signed changes. Hatching only for classes and committed money. No cards-with-shadows dashboard look, no side-stripe accent borders, no eyebrow labels above headings.
- **UI text German (de-AT), code/comments/docs English.** Use the glossary terms from `PRODUCT.md` (Zu verteilen, Verfügbar, Posteingang, Kontakt, Umbuchung …).
- Never enter or print secrets. Deploy tokens live only in GitHub Actions secrets.

## Workflow per task

- One task = one branch = one pull request. Keep PRs reviewable (roughly < 1.500 changed lines excluding lockfiles and snapshots).
- Before opening the PR: `npm run check` (typecheck, lint, unit tests) and, for UI, the Playwright tests incl. visual comparison. All green.
- PR description: what changed, how it maps to the roadmap checklist, screenshots (desktop 1440 and mobile 390) for UI, open questions.
- Update `docs/ROADMAP.md` checkboxes in the same PR.
- If the spec is unclear or wrong, stop and ask in the PR / session instead of guessing on product questions. Technical choices within the spec: decide, note them in the PR.

## Cost discipline (cloud credits are limited)

- Stay inside the task. Do not refactor unrelated code.
- Prefer reading specific files over broad exploration; the docs tell you where things are.
- Run the narrowest test set while iterating, the full check once before the PR.
- Do not generate large fixtures by hand; port the prototype's generator.

## Commands (after P1a)

- `npm install` — install workspaces
- `npm run dev` — web + server with hot reload
- `npm run check` — typecheck + lint + unit tests
- `npm run test:e2e` — Playwright (installs Chromium on first run: `npx playwright install chromium`)
- `npm run fixtures:ynab` — regenerate the synthetic YNAB export in `packages/fixtures/ynab-export/`
- `npm run proto` — serve `design/prototype` on http://localhost:5180 for comparison

## Task-specific skills

Local profiles and selection rationale: [`docs/skills.md`](docs/skills.md). Load the relevant `SKILL.md` through the mapping in `AGENTS.md`; avoid loading the entire capability catalogue for every task. Keep the existing prototype/design, technology stack, owner-defined placeholders and test/acceptance requirements. Use only available tools and report their actual results.

## Autonomous queue rules

Process, roles, lanes, risk classes, test-change policy, baselines, merging and closing: [`docs/queue/README.md`](docs/queue/README.md). One issue = one worktree = one PR; Sonnet agents implement and never merge, the Opus orchestrator reviews and merges. The unattended loop (`loop.sh`, `automerge.sh`, `run_queue.sh`, `live.sh`) is not in use; restart only with owner approval.

Hard guardrails (no exceptions without the owner):

- No force-push or history rewrite on `main`; never weaken branch protection or the ruleset.
- No destructive production data operations. Migrations must be reversible and tested on a copy first, otherwise label `needs-human`.
- No secrets in code, logs, issues or PRs. No changes to secrets, deploy credentials or Fly settings without owner approval.
- Implementing agents never edit existing tests; the orchestrator applies existing-test changes only under the owner's test-change policy ([`docs/queue/README.md`](docs/queue/README.md)). Weakening, skipping or deleting tests, tolerances or coverage needs explicit owner approval.
- No change to calculation rules (returns, portfolio logic, booking semantics) without documented approval; display-only changes are fine.
- No financial advice content.
- Do not interfere with other running work (worktrees, branches, PRs, issues you did not start).
- Suspected data loss or security problem: stop and open an `incident` issue.
- Issues close only when every acceptance criterion is verified and the merge is live (`queue:complete`); PRs say `Refs #N`, never `Closes`.

Use the Ponytail skill for coding ([`docs/queue/ponytail-summary.md`](docs/queue/ponytail-summary.md)); this file wins on conflict, and every acceptance criterion gets a test. Token rules: grep or line ranges, `gh` with `--json`/`--jq`/`--limit`, no polling, agent reports at most 10 lines.
