# P1a — Repo scaffold and stack spike

Paste into a new cloud session on this repository (model: Sonnet is enough; switch to Opus only if stuck).

---

You are starting the implementation of **Budget**, a private household finance PWA. Read `CLAUDE.md`, then `SPEC.md` (especially §0, §8, §9) and the P1a checklist in `docs/ROADMAP.md`. Do not read the whole concept; it is background.

Task: create the monorepo scaffold and a small stack spike so that later tasks can build on it.

Scope (exactly the P1a checklist in `docs/ROADMAP.md`):
1. npm workspaces with `apps/web`, `apps/server`, `packages/domain`, `packages/db`, `packages/ui`, `packages/fixtures`. TypeScript strict, ESLint, Prettier, Vitest. Root scripts: `dev`, `build`, `check` (typecheck + lint + unit tests), `test:e2e`, `proto` (serve `design/prototype` on 5180).
2. `apps/server`: Hono with `/health`; serves the built web app; security headers (CSP `default-src 'self'; script-src 'self'`, HSTS, no inline scripts).
3. `apps/web`: Vite + React + TanStack Router + TanStack Query; one route that renders "Budget" using the self-hosted fonts from `design/prototype/fonts/`.
4. `packages/domain/money`: integer-cent money type, de-AT formatter and the arithmetic amount parser. Match the behaviour of the amount field in `design/prototype/app.js` (search for the evaluator/parser) and `reference/finance-hub/money-input.mjs`: German decimals, thousands like `1.576`, `+ − × ÷` and `* /`, no `eval`. Write the tests first.
5. Playwright with one smoke test (`/health` and the web route).
6. Dockerfile (Node 22, multi-stage, non-root), `fly.toml` (region `fra`, internal port, volume mount `/data`, health check `/health`; app name `budget-fg` as placeholder, note it in the PR).
7. GitHub Actions: `ci.yml` (on PR: install, check, e2e with Chromium) and `deploy.yml` (on push to `main`: `superfly/flyctl-actions` deploy with `FLY_API_TOKEN`; skip gracefully if the secret is missing).
8. Chart spike: in `apps/web` render (a) the Heute pace chart and (b) a small Sankey from hard-coded sample data using own SVG with `d3-scale`/`d3-shape`, styled with the blueprint line types from `DESIGN.md`. Write `docs/adr/0001-charts.md` with the decision (own SVG vs ECharts) and why.

Out of scope: design tokens beyond fonts (P1b), app shell (P1c), database schema (P1d), auth (P1e).

Acceptance: `npm install && npm run check && npm run test:e2e` green in a clean checkout; `npm run build` produces a server that serves the web app; CI workflow passes on the PR. Tick the P1a boxes in `docs/ROADMAP.md`. Open one pull request with a short description, the ADR summary and a screenshot of the spike page.
