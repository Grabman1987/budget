# P1b — Design tokens and blueprint primitives

Paste into a new cloud session after P1a is merged (model: Sonnet; Opus for the visual review at the end if needed).

---

Read `CLAUDE.md`, `SPEC.md` §8, the whole `DESIGN.md`, `.impeccable/design.json`, and the P1b checklist in `docs/ROADMAP.md`. The visual reference is `design/prototype/styles.css` plus the screenshots in `design/screens/`. Open the prototype with `npm run proto` and compare while you build.

Task: turn the blueprint design system into code in `packages/ui` so every later page is assembled from the same parts.

Scope (P1b checklist):
1. Tokens → CSS custom properties and a Tailwind theme: ground, raised, ink 1–3, line, line-2, rules, graticule, class colours (need/want/future) with their hatch patterns, red for action, pastel heat green/red and good/bad inks, radii, spacing, type scale (Archivo + Barlow Semi Condensed), motion. Light, dark (`prefers-color-scheme` and a `data-theme` override) and print.
2. Primitives with typed props and stories on a dev page `/dev/bauteile`: TitleBlock, Registers, DimensionChain (inline variant; balance rounded parts like `balanceChain` in `design/prototype/reports-core.js`), PartsList (groups + positions like 1.1), RevisionTable (triangle marks A/B/C), AmountInput (domain parser from P1a, operator buttons, Enter evaluates), Segmented, Switch, SidePanel (desktop) / BottomSheet (phone), Toast with undo, status stamps, class swatches.
3. Chart primitives (own SVG from the P1a spike): graticule + axes, line with the ISO types (solid actual, dashed plan/forecast, dash-dot previous/benchmark), bars around zero, step line, band, elevation mark (Höhenkote).
4. Visual tests: Playwright screenshots of `/dev/bauteile` in light and dark; compare key primitives with crops of `design/screens/desktop/heute.webp` and `report-onepager.webp` by eye and note differences in the PR.

Rules: follow `DESIGN.md` exactly (red only for action; hatching only for classes and committed money; no shadows-on-cards look, no side-stripe borders, no eyebrow labels). Accessibility: 44 px targets, visible focus, reduced motion, colour never the only signal.

Acceptance: `npm run check` and e2e green; `/dev/bauteile` shows every primitive in both themes; boxes ticked in `docs/ROADMAP.md`; PR with screenshots (1440 and 390, light and dark).
