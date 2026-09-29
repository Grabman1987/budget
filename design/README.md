# Design reference

- `prototype/` — static clickable prototype (HTML, CSS, vanilla JS). Serve with `python -m http.server 5180 -d design/prototype` (or `npm run proto` after P1a). All numbers are synthetic.
  - `index.html` Heute (incl. booking dialog: `index.html#buchung`), `plan.html` Plan › Monat, `konten.html` Konten, `vermoegen.html` Vermögen, `einstellungen.html` Einstellungen, `reports.html` Reports (30 reports, routes `#r/<id>`).
  - `reports-core.js` is the shared sample ledger and the reference for calculation rules (see SPEC §6). The other `reports-*.js` files hold the report renderers.
  - `styles.css` holds the complete token set and all component styles.
  - The brand name in the prototype still reads "Finanz-App"; the product is called **Budget**.
- `screens/desktop/*.webp` (1440 px, full page) and `screens/mobile/*.webp` (390 px) — reference screenshots of every page and report.
- The design system is documented in `/DESIGN.md` and `/.impeccable/design.json`; direction contracts per page in `/.impeccable/surfaces/` (their `primary_target` paths refer to `design/prototype/…`).
