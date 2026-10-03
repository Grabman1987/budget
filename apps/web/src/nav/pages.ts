import type { AreaId } from './areas';
import { REPORT_GROUPS } from './reports-catalog';

/** Route metadata, also attached to each route as `staticData` (page title in the phone header). */
export interface PageMeta {
  title: string;
  area: AreaId;
  /** Register id inside the area that is highlighted for this page. */
  register?: string;
  /** Which package fills this page (docs/ROADMAP.md). */
  fills: string;
  /** What the page shows according to SPEC §3. */
  spec: string;
}

export interface PageDef extends PageMeta {
  path: string;
}

const P2 = 'P2 Kern und Migration';
const P3 = 'P3 Planung und Steuerung';
const P4 = 'P4 Datenquellen';
const P5 = 'P5 Vermögen';
const P6 = 'P6 Reports und Umstellung';

/** Every placeholder page with a fixed path. Heute, the report pages and dev pages are separate. */
export const PAGES: ReadonlyArray<PageDef> = [
  {
    path: '/plan/monat',
    title: 'Plan · Monat',
    area: 'plan',
    register: 'monat',
    fills: `${P2}; Geld verteilen in ${P3}`,
    spec: 'Wasserfall in neun Stufen, Zeit, Gruppen, Klassen und Triage; Stückliste der Envelopes; Zu verteilen mit Maßkette; 50/30/20-Band.',
  },
  {
    path: '/plan/jahr',
    title: 'Plan · Jahr',
    area: 'plan',
    register: 'jahr',
    fills: P3,
    spec: 'Jahresplanung und Szenarien.',
  },
  {
    path: '/plan/erwartet',
    title: 'Plan · Erwartet',
    area: 'plan',
    register: 'erwartet',
    fills: P3,
    spec: 'Erwartete Zahlungen mit versionierten Zeitplänen.',
  },
  {
    path: '/plan/sparziele',
    title: 'Plan · Sparziele',
    area: 'plan',
    register: 'sparziele',
    fills: P3,
    spec: 'Sparziele und Rücklagen mit Fortschritt.',
  },
  {
    path: '/konten',
    title: 'Konten',
    area: 'konten',
    register: 'uebersicht',
    fills: P2,
    spec: 'Nettovermögen mit Maßkette nach Kontogruppen, Kontenstückliste mit 30-Tage-Linie.',
  },
  {
    path: '/konten/buchungen',
    title: 'Alle Buchungen',
    area: 'konten',
    register: 'buchungen',
    fills: P2,
    spec: 'Filterzeile, Tagesgruppen mit Tagessumme, Mehrfachauswahl, CSV.',
  },
  {
    path: '/konten/posteingang',
    title: 'Posteingang',
    area: 'konten',
    register: 'posteingang',
    fills: `${P3} (Grundlagen), ${P4}`,
    spec: 'Revisionstabelle nach Typ, jede Entscheidung ein Klick, „Immer so zuordnen“ legt eine Regel an.',
  },
  {
    path: '/konten/kontakte',
    title: 'Kontakte',
    area: 'konten',
    register: 'kontakte',
    fills: P3,
    spec: 'Kontakte mit Forderungskonto und Kontoblatt je Person.',
  },
  {
    path: '/vermoegen/nettovermoegen',
    title: 'Vermögen · Nettovermögen',
    area: 'vermoegen',
    register: 'nettovermoegen',
    fills: P5,
    spec: 'Leitwert mit Maßkette Anfang + Eigenleistung + Markt, Zusammensetzung, Verlauf.',
  },
  {
    path: '/vermoegen/portfolio',
    title: 'Vermögen · Portfolio',
    area: 'vermoegen',
    register: 'portfolio',
    fills: P5,
    spec: 'Soll/Ist, Rebalancing, Sparpläne, Positionen als Stückliste.',
  },
  {
    path: '/vermoegen/schulden',
    title: 'Vermögen · Schulden',
    area: 'vermoegen',
    register: 'schulden',
    fills: P5,
    spec: 'Restschuld mit Maßkette, Sondertilgung als Rechenfeld, Kartenauslastung.',
  },
  {
    path: '/vermoegen/freiheit',
    title: 'Vermögen · Freiheitszahl',
    area: 'vermoegen',
    register: 'freiheit',
    fills: P5,
    spec: 'Freiheitszahl mit Soll-Pfad zum Zieljahr und nötiger Sparrate.',
  },
  {
    path: '/einstellungen/profil',
    title: 'Einstellungen · Profil',
    area: 'einstellungen',
    register: 'profil',
    fills: P2,
    spec: 'Name, Kürzel, Geburtsdatum, Haushalt und Region für den späteren Vergleich mit der Statistik Austria.',
  },
  {
    path: '/einstellungen/konten',
    title: 'Einstellungen · Konten',
    area: 'einstellungen',
    register: 'konten',
    fills: P2,
    spec: 'Konten mit Rolle und Konditionen (Limits, Zinsen, Laufzeit).',
  },
  {
    path: '/einstellungen/depots',
    title: 'Einstellungen · Depots & Kryptos',
    area: 'einstellungen',
    register: 'depots',
    fills: P5,
    spec: 'Einstandskostenmethode: gleitender Durchschnitt als Standard, FIFO wählbar.',
  },
  {
    path: '/einstellungen/projekte',
    title: 'Einstellungen · Projekte',
    area: 'einstellungen',
    register: 'projekte',
    fills: P6,
    spec: 'Projekte anlegen, umbenennen und archivieren.',
  },
  {
    path: '/einstellungen/kategorien',
    title: 'Einstellungen · Kategorien',
    area: 'einstellungen',
    register: 'kategorien',
    fills: P2,
    spec: 'Kategorien, Gruppen und Klassen.',
  },
  {
    path: '/einstellungen/regelwerk',
    title: 'Einstellungen · Regelwerk',
    area: 'einstellungen',
    register: 'regelwerk',
    fills: P3,
    spec: 'Stufen und konfigurierbare Regeln mit Status und Aktion.',
  },
  {
    path: '/einstellungen/zuordnung',
    title: 'Einstellungen · Zuordnungsregeln',
    area: 'einstellungen',
    register: 'zuordnung',
    fills: P4,
    spec: 'Zuordnungsregeln für den Bank-Sync.',
  },
  {
    path: '/einstellungen/datenquellen',
    title: 'Einstellungen · Datenquellen',
    area: 'einstellungen',
    register: 'datenquellen',
    fills: P4,
    spec: 'Quelle je Konto, Rhythmus, Einwilligung, Quellstempel, Nachtlauf.',
  },
  {
    path: '/einstellungen/anlageklassen',
    title: 'Einstellungen · Anlageklassen',
    area: 'einstellungen',
    register: 'anlageklassen',
    fills: P5,
    spec: 'Anlageklassen mit Soll-Allocation.',
  },
  {
    path: '/einstellungen/export',
    title: 'Einstellungen · CSV-Export',
    area: 'einstellungen',
    register: 'export',
    fills: P4,
    spec: 'CSV-Export aller Konten und Depots; vorerst nur ein Platzhalter ohne Downloadfunktion.',
  },
  {
    path: '/einstellungen/sicherheit',
    title: 'Einstellungen · Sicherheit',
    area: 'einstellungen',
    register: 'sicherheit',
    fills: 'P1e Auth',
    spec: 'Passkeys, Wiederherstellungscodes, Sitzungen.',
  },
];

/** Einstellungen › Sicherheit; its own constant because the route and the (lazy) page both need it. */
export const INVESTMENT_SETTINGS_META = PAGES.find((p) => p.path === '/einstellungen/depots')!;

/** Einstellungen › Profil. */
export const PROFILE_META = PAGES.find((p) => p.path === '/einstellungen/profil')!;

export const SECURITY_META: PageDef = (() => {
  const page = PAGES.find((p) => p.path === '/einstellungen/sicherheit');
  if (!page) throw new Error('Missing page /einstellungen/sicherheit');
  return page;
})();

export const HEUTE: PageMeta = {
  title: 'Heute',
  area: 'heute',
  fills: P3,
  spec: 'Leitmaß „frei verfügbar bis Gehalt“, Pace, anstehende Zahlungen, Finanz-Check, Nettovermögen.',
};

/** Einstellungen index: the grouped list of all settings pages (the phone's entry, SPEC §3). */
export const SETTINGS_INDEX: PageMeta = {
  title: 'Einstellungen',
  area: 'einstellungen',
  fills: P2,
  spec: 'Gruppierte Übersicht aller Einstellungen: Daten, Automatik, System.',
};

export const REPORTS_CATALOG: PageMeta = {
  title: 'Reports',
  area: 'reports',
  register: 'katalog',
  fills: P6,
  spec: 'Katalog der 30 Reports als Stückliste in fünf Baugruppen.',
};

export const REPORT_GROUP_PAGES = REPORT_GROUPS.map((g) => ({
  slug: g.slug,
  meta: {
    title: `Reports · ${g.name}`,
    area: 'reports' as const,
    register: g.slug,
    fills: P6,
    spec: 'Reports dieser Baugruppe.',
  } satisfies PageMeta,
}));

/** Konten › Übersicht (built in P2a; the placeholder entry above stays the source of its text). */
export const KONTEN_META: PageMeta = PAGES.find((p) => p.path === '/konten') as PageMeta;

/** Vermögen › Nettovermögen (built in P5.4). */
export const VERMOEGEN_NETTO_META: PageDef = PAGES.find(
  (p) => p.path === '/vermoegen/nettovermoegen',
) as PageDef;

/** Konten › Alle Buchungen (built in P2a). */
export const KONTEN_BUCHUNGEN_META: PageMeta = PAGES.find(
  (p) => p.path === '/konten/buchungen',
) as PageMeta;

export const ACCOUNT_PAGE: PageMeta = {
  title: 'Konto',
  area: 'konten',
  register: 'uebersicht',
  fills: P2,
  spec: 'Einzelkonto mit 90-Tage-Stufenlinie, Buchungsliste und „Kontostand prüfen“.',
};

export const REPORT_PAGE_FILLS = P6;

/** Einstellungen › Kategorien (built in P2c). */
export const EINSTELLUNGEN_KATEGORIEN: PageDef = PAGES.find(
  (p) => p.path === '/einstellungen/kategorien',
) as PageDef;

/** Einstellungen › Regelwerk (built in P3.7). */
export const EINSTELLUNGEN_REGELWERK: PageDef = PAGES.find(
  (p) => p.path === '/einstellungen/regelwerk',
) as PageDef;

/** CSV export stays a placeholder until the owner requests the download feature. */
export const CSV_EXPORT_META: PageDef = PAGES.find(
  (p) => p.path === '/einstellungen/export',
) as PageDef;

/** Plan › Monat (built in P2c). */
export const PLAN_MONAT: PageDef = PAGES.find((p) => p.path === '/plan/monat') as PageDef;
export const PLAN_JAHR: PageDef = PAGES.find((p) => p.path === '/plan/jahr') as PageDef;

/** Plan › Erwartet (built in P3.6). */
export const PLAN_ERWARTET: PageDef = PAGES.find((p) => p.path === '/plan/erwartet') as PageDef;
/** Plan › Sparziele (built in P3.4). */
export const PLAN_SPARZIELE: PageDef = PAGES.find((p) => p.path === '/plan/sparziele') as PageDef;

/** Vermögen › Portfolio positions (P5). */
export const VERMOEGEN_PORTFOLIO_META: PageDef = PAGES.find(
  (p) => p.path === '/vermoegen/portfolio',
) as PageDef;

export const VERMOEGEN_FREIHEIT_META: PageDef = PAGES.find(
  (p) => p.path === '/vermoegen/freiheit',
)!;

export const VERMOEGEN_SCHULDEN_META: PageDef = PAGES.find(
  (page) => page.path === '/vermoegen/schulden',
)!;
