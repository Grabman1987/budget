# P1c — App shell and routing

Paste into a new cloud session after P1b is merged (model: Sonnet).

---

Read `CLAUDE.md`, `SPEC.md` §3 and §8, `DESIGN.md` (navigation, title block, registers, panels), and the P1c checklist in `docs/ROADMAP.md`. Reference: the shell of every page in `design/prototype/*.html` and `design/screens/desktop/*.webp`, `design/screens/mobile/*.webp`.

Task: build the application shell and all routes so later packages only fill pages.

Scope (P1c checklist):
1. Desktop shell: sidebar "Planliste" with the five areas numbered 01–05 (Heute, Plan, Konten, Vermögen, Reports), collapse state remembered, theme toggle, Einstellungen and profile at the bottom; top bar with search (Ctrl K focuses), Posteingang button with counter, primary "+ Buchung".
2. Mobile (< 768 px): header with page title, inbox and theme buttons, bottom tab bar with the five areas, floating + button. Same content and order as desktop.
3. Routes for every area and register listed in SPEC §3 (e.g. `/plan/monat`, `/konten/:id`, `/vermoegen/portfolio`, `/reports`, `/reports/:reportId`, `/einstellungen/konten`). Each placeholder page uses TitleBlock + Registers and states which package fills it.
4. Side panel / bottom sheet driven by a route search param, closable with Esc, focus returns to the trigger.
5. Playwright: navigate every route at 1440 and 390; screenshots of the shell compared with `design/screens` for layout (sidebar width, title block, registers, tab bar). Record differences in the PR.

Out of scope: real data, forms, charts on pages.

Acceptance: all routes reachable by URL and navigation on both widths; keyboard navigation works; `npm run check` and e2e green; boxes ticked; PR with screenshots.
