# Budget · Blueprint Design System

Design system for **Budget** (budget-fg.fly.dev) — a self-built personal-finance web app for a two-person household, used by one person. Desktop first, iPhone PWA second. German UI; this documentation is in English.

Core: envelope budgeting (YNAB-style), cash-flow forecast to next salary, net worth, full investment portfolio tracking (allocation, price history), savings goals and rule checks (50/30/20). The target feel is a dense, calm, trustworthy **financial cockpit drawn like a technical blueprint** ("Das Konstruktionsblatt").

## Sources
- **Figma:** "FinanceApp – Blueprint Design V2 · Desktop & iPhone" (.fig, attached). Key pages: `00-ALLE-MOCKUPS` (V3.3 Blueprint dark Heute/Plan/Konten/Vermögen/Kontoprognose, desktop 1440 + iPhone 390), `00-Blueprint-Regelwerk`, `20-ZIELSYSTEM-Komponenten` (component set + Hell/Dunkel colour roles), `21–29` per-area target designs, `30-PROTOTYP` (362 frames), `40-HEUTE-Design-Zeitreise` (12 style studies).
- **GitHub:** https://github.com/Grabman1987/budget — read `DESIGN.md` (full rule book „Blaupause"), `.impeccable/design.json`, `packages/ui/src/styles/*.css` (tokens, components), `packages/ui/src/components/*` (TitleBlock, DimensionChain, PartsList, StatusMark…), `design/prototype/` (static clickable prototype) and `design/screens/`. Explore these repos further for exact behaviour, data structures and calculation rules.
- Fonts and the brand mark were copied from the repo (`design/prototype/fonts/`, `apps/web/public/icons/`).

## Index
- `styles.css` — global entry (imports only) → `tokens/fonts.css`, `tokens/fig-tokens.css` (Figma Variables, both collections, all modes), `tokens/fig-typography.css` (empty: the file defines 0 text styles), `tokens/blueprint.css` (type scale, radii, spacing, strokes, dash patterns, grid, elevation, motion, semantic aliases, scoped Hell/Dunkel), `tokens/base.css` (body reset + `.bp-grid`, `.bp-label`, `.tnum`).
- `guidelines/` — foundation cards (Colors, Type, Spacing, Brand).
- `components/<group>/` — React components materialised from Figma, with `.d.ts`, `.prompt.md` and one card per directory.
- `ui_kits/app/` — desktop click-through (Heute, Plan, Konten, Konto-Detail, Vermögen, Prüfen, Buchungsdialog, Suche Strg K, Toast).
- `ui_kits/iphone/` — iPhone PWA (Heute, Plan, Konten, tab bar, quick-add sheet), dark and Lichtpause side by side.
- `assets/` — `budget.svg`, `budget-192.png`, `budget-512.png` (app icons), `budget-mark.svg` (outline mark, currentColor).
- `fonts/` — Archivo variable, Barlow Semi Condensed 400/500/600 (woff2).
- `SKILL.md` — agent-skill entry.

## Components
All 45 Figma component families (the 12 Zeitreise style studies live in `components/archiv/`), namespace `window.BudgetBlueprintDesignSystem_63932b`:
- **buttons/** ButtonPrimary, ButtonSecondary, ButtonGhost, ButtonDanger, BlueprintButtonPrimary
- **forms/** FeldNormal, FeldFokus, FeldFehler, FeldErfolg, FeldDeaktiviert, Checkbox, Schalter
- **feedback/** HinweisInformation, HinweisAchtung, HinweisErfolg, HinweisHandeln, Fortschritt
- **status/** StatusVorgemerkt, StatusBestTigt, StatusAbgeglichen, StatusGesperrt, PrFbadge (set: geprüft / fällig)
- **navigation/** Register, ZeileAuswHlbar, DialogKopf
- **charts/** DiagrammLegende
- **blueprint/** BlueprintSchriftfeld, BlueprintMaKette, BlueprintAbschnitt, BlueprintKlassenUndSchraffur, BlueprintStCklistenposition
- **archiv/** Zeitreise01Kennzahl, Zeitreise02Kennzahl, Zeitreise03Kennzahl, Zeitreise04Kennzahl, Zeitreise05Kennzahl, Zeitreise06Kennzahl, Zeitreise07Kennzahl, Zeitreise08Kennzahl, Zeitreise09Kennzahl, Zeitreise10Kennzahl, Zeitreise11Kennzahl, Zeitreise12Kennzahl

Components keep the exact Figma geometry (fixed widths, absolute text positions); resize via `style`. Text props are `text1…text4`; the first also accepts `children`. They read Zielsystem tokens, so `data-mode="dunkel"` on any ancestor switches them to Blueprint dark.

**Not defined in the source** (so not built as components): KPI card, data table, charts, tabs-bar, modal, toast as reusable primitives. The UI kits show them composed from tokens, following the mockups.

## Content fundamentals
- **Language:** German UI, de-DE/de-AT number formats: `1.517,69 €`, thousands dot, decimal comma, space before €. Real minus sign `−` (U+2212), explicit `+` for inflows (`+4.323,68 €`).
- **Tone:** factual, technical, calm. No exclamation marks, no praise, no emoji. The number is the answer — page heads carry no judgement sentence ("Ja, der Monat hält" is banned).
- **Address:** informal *du* when addressing the user ("Angabe prüfen, bevor du fortfährst."), otherwise impersonal noun phrases.
- **Casing:** sentence case for titles/body (Heute, Nächster Gehaltseingang); UPPERCASE technical lettering for labels, table heads, axes, sheet lines (FREI BIS GEHALT, ZUGEWIESEN, BLATT 02 / FINANZPLAN · REV 03).
- **Separators:** middle dot ` · ` joins facts ("1 Tag verbleibend · kein Puffer"); slash ` / ` builds drawing-style headings ("OKTOBER 2026 / MONATSPACE", "STAND / 14.10.2026").
- **Action words:** plain verbs on buttons — Decken, Prüfen, Bestätigen, Geld verteilen, Herleitung zeigen, Kontostände prüfen →. Drawing vocabulary (Maßkette, Stückliste, Revision, Wasserstand) stays in graphics, not buttons.
- **Honesty markers:** demo/data provenance is always stated ("Schematischer Verlauf · keine Live-Daten", "STUDIE / DEMODATEN", "Stand 14.10.2026").
- Examples: "Liquidität bis zum Gehalt", "100,5 % des Monatslimits verbraucht", "Überzogen um 16,00 €", "Direkt ausführen · rückgängig", "5 Kontostände nicht geprüft".

## Visual foundations
- **Modes / directions in the file:** (1) **Blueprint V3.3 dark** — the main mockups: Prussian canvas `#082D56`, nav `#05254A`, panels `#0B3766`, strokes `#4987BC`, accent `#D0F4FF`. (2) **Zielsystem Hell „Lichtpause"** — blue ink on drafting film `#EEF3F9`/white, ink `#0A2342`, primary `#0D5EAE`. (3) **Zielsystem Dunkel** — the same roles mapped onto the blueprint values. (4) **V3.1 Hybrid** — the `--color-*` collection. Toggle via `data-mode="dunkel" | "hell"`.
- **Colour semantics:** only blues for structure; two signal inks: **minus / act-now** orange-red (`--negative`: `#B8380A` hell, `#FF9D7A` dunkel; V3 `#FF958A`) and **plus** teal (`--positive`: `#0B7285` / `#4FE3D0`; V3 `#54FFC3`). Amber `--warning` for "check". Each has a `*soft` fill for pills. Colour never alone: always sign, arrow or symbol. Negative KPI = whole number in minus ink; positives stay restrained (ink) except available-money pills.
- **Type:** Archivo (variable) for everything, always `tabular-nums`; KPI 29/700, Leitmaß 56, page title 28–32/600. Barlow Semi Condensed 500/600 for technical lettering (12px, +0.06em, uppercase). Archivo Narrow 600 11px for KPI labels in V3.3. Minimum 11–12px.
- **Backgrounds:** flat blueprint blue; graph-paper raster (10px fine @4.5 %, 50px major @13 %) only inside the title block and chart areas — never as full-page wallpaper. No photos, no illustrations, no gradients.
- **Title block (Schriftfeld):** every page starts with it — `--title` blue, 2px radius, 1px `#9DDAFC` frame, raster, sheet line "BLATT 0N / … · REV 03", big title, sub-line, right-hand priority field; small corner registration crosses at top-left and bottom-right.
- **Panels/cards:** `--surface`, 4px radius, 1px inset stroke (`--field`), no shadow. One card = one working surface; inside, hairlines divide — never cards in cards. Section heads are UPPERCASE 15/600 with a hairline under.
- **Lines (ISO 128):** Ist solid 1.5px; Plan/Prognose dashed `7 5`; Vormonat dash-dot `12 4 2 4`; Heute dotted `1 3`; Deckel muted solid 1px with sole right-end label. Dimension lines with slash terminators and dotted extension lines.
- **Radii:** titleblock 2 · stamp 3 · panel 4 · input 6 (Regelwerk) / controls & fields 8 (Zielsystem) · sheet/dialog 12 · pill 999 (status only) · circle numbers 50 %.
- **Elevation:** flat. Shadow only for floating layers (dialog, palette, toast, combobox): `--shadow-float(-dark)`. Top bar 88 % translucent with 10px blur.
- **Progress bars:** 6px in KPI cards (radius 2, track = stroke @65 %), 3–4px under rows, ≤10px stacked.
- **Layout:** sidebar 210px (collapsible to 72), top bar ~58px (search, Stand, Prüfen · N, + Buchung), 17–19px page padding, 15px gaps; full width, no max page width. iPhone: header with mark + search + "+", 5-tab bottom bar (Heute · Plan · Konten · Vermögen · Reports), 44px minimum targets, bottom sheets only for forms.
- **States:** hover = `--soft` tint; selected = `--active` fill + 1px primary inset; focus = 2px primary outline, 2px offset; press = 1px down; disabled ≈ 45 % opacity. Over-budget rows carry minus-ink text, pill with minus stroke.
- **Motion:** minimal. First chart per page may plot in 900ms `cubic-bezier(0.16,1,0.3,1)`; disclosures 240ms; no bounces; everything off under `prefers-reduced-motion`.
- **Transparency/blur:** only scrims (`rgba(4,14,32,.55)`) and the sticky top bar.

## Iconography
- The app (repo) uses **Lucide** (`lucide-react`), 16px, stroke 1.75; 18–22px in nav/tab bar. The UI kits load Lucide from CDN (`lucide@0.469.0`) — same set as production.
- The Figma mockups use Unicode glyphs as nav placeholders (⌂ ▦ ▤ ▥ ☼ ⚙ ⌕ ＋); treat them as stand-ins for the Lucide icons House, LayoutGrid, Rows3, TrendingUp, Columns3, Sun, Settings, Search, Plus.
- Figma components embed their own inline SVG glyphs (warning triangle, check etc.) painted with `currentColor`.
- No emoji in the UI (the repo ships a Noto Emoji subset only for user-entered category names). Unicode arrows `→ ↑ ↵` and `·` are used in copy.
- **Brand mark:** the repo's `budget.svg` (rounded square with a rising line over a dimension line). Wordmark "BUDGET" is set in Archivo 700 with "FINANCE ENGINEERING" below — type only, no logo lockup file exists.

## Archived
- **archiv/** Zeitreise01Kennzahl, Zeitreise02Kennzahl, Zeitreise03Kennzahl, Zeitreise04Kennzahl, Zeitreise05Kennzahl, Zeitreise06Kennzahl, Zeitreise07Kennzahl, Zeitreise08Kennzahl, Zeitreise09Kennzahl, Zeitreise10Kennzahl, Zeitreise11Kennzahl, Zeitreise12Kennzahl — Figma "Zeitreise/01…12/Kennzahl" style studies. Kept for Figma parity in an "Archiv" card; not shown under Components and not for product UI.

## Intentional additions
- `assets/budget-mark.svg` — the repo icon's paths without the blue background tile, for use on the dark sidebar (as the mockups do).
- Scoped `[data-mode="hell"]` / `[data-mode="dunkel"]` token blocks in `tokens/blueprint.css` so light and dark islands can coexist.
- `onClick`/`children` pass-through on all materialised components.

## Caveats
- Figma text styles: the file defines none (0), so typography lives in `tokens/blueprint.css` from DESIGN.md + mockup values.
- The repo's earlier "Präzisionsschicht" light theme (`#1747a6`, forest green) differs from the Figma Zielsystem; the Figma file wins here.

## Intentionally skipped
- `#526 / native table row`, `#526 / native phone stage card` — removed at the owner's request; not used on any screen, and the "#526" prefix cannot start a component name.
