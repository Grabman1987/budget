# Current sitemap — source inventory

Reviewed 2026-10-15 at `01a10de8`. Sources: [router](../../apps/web/src/router.tsx),
[page metadata](../../apps/web/src/nav/pages.ts) and
[report catalog](../../apps/web/src/nav/reports-catalog.ts).
This inventories registered destinations, not acceptance or screenshot evidence.

## Navigation

```text
Budget
├── Access: /setup, /login
├── Heute: /
├── Plan: Monat, Jahr, Zahlungen, Ziele, Prognose (Seitenreview 16.10.2026)
├── Konten: Übersicht, Buchungen, Posteingang, Kontakte
├── Vermögen: Nettovermögen, Portfolio, Schulden, Freiheit
├── Reports: catalog → five groups → 34 reports
└── Settings: profile, accounts, depots, projects, basket, categories,
    rules, assignment rules, data sources, asset classes, export, security

Cross-cutting: capture, search, month close, detail pages
Proposed: financial onboarding checklist (not registered)
```

Detail pages use breadcrumbs/back navigation. Apply the current SPEC directives:
content details are pages, with the later explicit Plan inspector and search
exceptions. Form dialogs remain forms. No new third-level primary menu is proposed.

## Fixed navigation destinations

| Destination | Registered path |
| --- | --- |
| Heute | `/` |
| Settings overview | `/einstellungen` |
| Plan · Monat | `/plan/monat` |
| Plan · Jahr | `/plan/jahr` |
| Plan · Zahlungen (Seite „Zahlungen und Abos“) | `/plan/erwartet` |
| Plan · Sparziele | `/plan/sparziele` |
| Konten | `/konten` |
| Alle Buchungen | `/konten/buchungen` |
| Prüfen (früher Posteingang; alte Adresse leitet weiter) | `/konten/posteingang` → `/konten/pruefen` |
| Kontakte | `/konten/kontakte` |
| Vermögen · Nettovermögen | `/vermoegen/nettovermoegen` |
| Vermögen · Portfolio | `/vermoegen/portfolio` |
| Vermögen · Schulden | `/vermoegen/schulden` |
| Vermögen · Freiheitszahl | `/vermoegen/freiheit` |
| Einstellungen · Profil | `/einstellungen/profil` |
| Einstellungen · Konten | `/einstellungen/konten` |
| Einstellungen · Depots & Kryptos | `/einstellungen/depots` |
| Einstellungen · Projekte | `/einstellungen/projekte` |
| Einstellungen · Warenkorb (Teuerung) | `/einstellungen/warenkorb` |
| Einstellungen · Kategorien | `/einstellungen/kategorien` |
| Einstellungen · Regelwerk | `/einstellungen/regelwerk` |
| Einstellungen · Zuordnungsregeln | `/einstellungen/zuordnung` |
| Einstellungen · Datenquellen | `/einstellungen/datenquellen` |
| Einstellungen · Anlageklassen | `/einstellungen/anlageklassen` |
| Einstellungen · CSV-Export | `/einstellungen/export` |
| Einstellungen · Sicherheit | `/einstellungen/sicherheit` |

## Explicit additional router paths

`$id`, `$month`, `$kind`, `$slug` and `$reportId` are parameters. These routes
include detail pages and access flows, not additional top-level navigation.

- `/erfassen`
- `/konten/posteingang/$id`
- `/einstellungen/kategorien/$id`
- `/plan/sparziele/$id`
- `/einstellungen/regelwerk/$code`
- `/plan/monat/envelope/$id`
- `/plan/monat/einnahmen`
- `/plan/erwartet/$id`
- `/plan/erwartet/einnahmen`
- `/heute/details/$kind`
- `/vermoegen/portfolio/instrument/$id`
- `/vermoegen/portfolio/sparplan/$id`
- `/konten/$id`
- `/reports`
- `/reports/gruppe/$slug`
- `/reports/$reportId`
- `/reports/gehalt/historie`
- `/reports/einnahmen-ausgaben/buchungen`
- `/login`
- `/setup`
- `/konten/kontakte/$id`
- `/suche`
- `/monatsabschluss/$month`

## Reports — current catalog

### Monat und Einkommen

Group route: `/reports/gruppe/monat`.

| Report | Path |
| --- | --- |
| Monats-One-Pager | `/reports/onepager` |
| Gehaltsreport | `/reports/gehalt` |
| Einnahmen | `/reports/einnahmen` |
| Geldfluss | `/reports/geldfluss` |
| Jahresansicht | `/reports/jahresansicht` |
| Kategorieübersicht | `/reports/kategorien` |
| Sparquote und Geldalter | `/reports/sparquote` |
| Gesamttabelle | `/reports/gesamttabelle` |
| Projekte und Nebeneinkünfte | `/reports/projekte` |
| Einnahmen und Ausgaben | `/reports/einnahmen-ausgaben` |
| Prognosegenauigkeit | `/reports/planungstreue` |

### Ausgaben und Plan

Group route: `/reports/gruppe/ausgaben`.

| Report | Path |
| --- | --- |
| Ausgabenanalyse | `/reports/ausgaben` |
| Budgettreue | `/reports/budgettreue` |
| Verträge und Abos | `/reports/abos` |
| Persönliche Inflation | `/reports/inflation` |
| Empfänger-Analyse | `/reports/empfaenger` |
| Bank- und Zinskosten | `/reports/kosten` |

### Zukunft und Vermögen

Group route: `/reports/gruppe/zukunft`.

| Report | Path |
| --- | --- |
| Liquiditätsprognose → Plan › Prognose (Report-Slug leitet weiter) | `/reports/liquiditaet` → `/plan/prognose` |
| Cashflow-Verlauf | `/reports/cashflow` |
| Vermögensverläufe | `/reports/vermoegen` |
| Jahresvorschau Zahlungen | `/reports/vorschau` |
| Sparziele-Fortschritt | `/reports/sparziele` |
| Vermögen & Schulden | `/reports/vermoegen-schulden` |

### Portfolio

Group route: `/reports/gruppe/portfolio`.

| Report | Path |
| --- | --- |
| Depots im Vergleich | `/reports/pdepots` |
| Allocation | `/reports/pallocation` |
| Einzahlungen und Wert | `/reports/peinzahlungen` |
| Rendite und Kennzahlen | `/reports/prendite` |
| Kosten, Steuern, Erträge | `/reports/psteuern` |

### Überblick

Group route: `/reports/gruppe/ueberblick`.

| Report | Path |
| --- | --- |
| Gesamtübersicht | `/reports/gesamtuebersicht` |
| Jahresreport | `/reports/jahresreport` |
| Finanz-Check-Verlauf | `/reports/finanzcheck` |
| Explorer | `/reports/explorer` |
| Kontakte-Abrechnung | `/reports/kontakte` |
| Zeitraumvergleich | `/reports/vergleich` |

## Redirects and developer surfaces

- `/plan` redirects to `/plan/monat`.
- `/vermoegen` redirects to `/vermoegen/nettovermoegen`.
- Legacy `/einstellungen/import` redirects to `/einstellungen/export`; it is not an import feature.
- `/dev/*` routes are development/E2E surfaces, excluded from the production build.
- Existing month/period/filter query parameters preserve linkable view context;
  see the router and the relevant feature validators for their exact semantics.

## Missing journey connection

Open GAP01–03 extend the content of the existing Vermögen/Portfolio area; no new
route is claimed delivered. GAP05 reconciles Figma's Plan/settings navigation with
the registered destinations above before changing labels/routes. O01–O08 remain
unimplemented first-use designs; see [open gaps](open-gaps.md).

Secure setup ends at Heute. The proposed `/einrichtung` checklist would connect
existing account/category/plan screens into a first-use journey. Its URL, state
contract and Figma screens are proposals pending owner decisions. The supplied
Figma `172:2` is a Heute/prognosis page; it must not be treated as the whole sitemap.
