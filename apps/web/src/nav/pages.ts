import type { AreaId } from './areas';
import { REPORT_GROUPS } from './reports-catalog';

/** Route metadata, also attached to each route as `staticData` (page title in the phone header). */
export interface PageMeta {
  title: string;
  area: AreaId;
  /** Register id inside the area that is highlighted for this page. */
  register?: string;
  /** Short question or purpose, shown next to the title. */
  question?: string;
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
    question: 'Jeder Euro hat einen Job.',
    fills: `${P2}; Geld verteilen in ${P3}`,
    spec: 'Wasserfall in neun Stufen, Zeit, Gruppen, Klassen und Triage; Stückliste der Envelopes; Zu verteilen mit Maßkette; 50/30/20-Band.',
  },
  {
    path: '/plan/jahr',
    title: 'Plan · Jahr',
    area: 'plan',
    register: 'jahr',
    question: 'Wie sieht das Jahr aus?',
    fills: P3,
    spec: 'Jahresplanung und Szenarien.',
  },
  {
    path: '/plan/erwartet',
    title: 'Plan · Erwartet',
    area: 'plan',
    register: 'erwartet',
    question: 'Was kommt noch?',
    fills: P3,
    spec: 'Erwartete Zahlungen mit versionierten Zeitplänen.',
  },
  {
    path: '/plan/sparziele',
    title: 'Plan · Sparziele',
    area: 'plan',
    register: 'sparziele',
    question: 'Wofür sparen wir?',
    fills: P3,
    spec: 'Sparziele und Rücklagen mit Fortschritt.',
  },
  {
    path: '/konten',
    title: 'Konten',
    area: 'konten',
    register: 'uebersicht',
    question: 'Was ist passiert?',
    fills: P2,
    spec: 'Nettovermögen mit Maßkette nach Kontogruppen, Kontenstückliste mit 30-Tage-Linie.',
  },
  {
    path: '/konten/buchungen',
    title: 'Alle Buchungen',
    area: 'konten',
    register: 'buchungen',
    question: 'Jede Buchung, filterbar.',
    fills: P2,
    spec: 'Filterzeile, Tagesgruppen mit Tagessumme, Mehrfachauswahl, CSV.',
  },
  {
    path: '/konten/posteingang',
    title: 'Posteingang',
    area: 'konten',
    register: 'posteingang',
    question: 'Was braucht eine Entscheidung?',
    fills: `${P3} (Grundlagen), ${P4}`,
    spec: 'Revisionstabelle nach Typ, jede Entscheidung ein Klick, „Immer so zuordnen“ legt eine Regel an.',
  },
  {
    path: '/konten/kontakte',
    title: 'Kontakte',
    area: 'konten',
    register: 'kontakte',
    question: 'Wer schuldet wem?',
    fills: P3,
    spec: 'Kontakte mit Forderungskonto und Kontoblatt je Person.',
  },
  {
    path: '/vermoegen/nettovermoegen',
    title: 'Vermögen · Nettovermögen',
    area: 'vermoegen',
    register: 'nettovermoegen',
    question: 'Was besitze ich?',
    fills: P5,
    spec: 'Leitwert mit Maßkette Anfang + Eigenleistung + Markt, Zusammensetzung, Verlauf.',
  },
  {
    path: '/vermoegen/portfolio',
    title: 'Vermögen · Portfolio',
    area: 'vermoegen',
    register: 'portfolio',
    question: 'Was entscheide ich?',
    fills: P5,
    spec: 'Soll/Ist, Rebalancing, Sparpläne, Positionen als Stückliste.',
  },
  {
    path: '/vermoegen/schulden',
    title: 'Vermögen · Schulden',
    area: 'vermoegen',
    register: 'schulden',
    question: 'Wann bin ich schuldenfrei?',
    fills: P5,
    spec: 'Restschuld mit Maßkette, Sondertilgung als Rechenfeld, Kartenauslastung.',
  },
  {
    path: '/vermoegen/freiheit',
    title: 'Vermögen · Freiheitszahl',
    area: 'vermoegen',
    register: 'freiheit',
    question: 'Wie weit ist der Weg?',
    fills: P5,
    spec: 'Freiheitszahl mit Soll-Pfad zum Zieljahr und nötiger Sparrate.',
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
    spec: 'Stufen und Regeln R01–R16 mit Schwellen, Status und Aktion.',
  },
  {
    path: '/einstellungen/zuordnung',
    title: 'Einstellungen · Zuordnungsregeln',
    area: 'einstellungen',
    register: 'zuordnung',
    fills: P4,
    spec: 'Zuordnungsregeln für Importe und Bank-Sync.',
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
    path: '/einstellungen/import',
    title: 'Einstellungen · Import/Export',
    area: 'einstellungen',
    register: 'import',
    fills: P4,
    spec: 'Datei-Import mit gespeicherter Spaltenzuordnung, Export.',
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

export const HEUTE: PageMeta = {
  title: 'Heute',
  area: 'heute',
  question: 'Hält der Monat?',
  fills: P3,
  spec: 'Leitmaß „frei verfügbar bis Gehalt“, Pace, anstehende Zahlungen, Finanz-Check, Nettovermögen.',
};

export const REPORTS_CATALOG: PageMeta = {
  title: 'Reports',
  area: 'reports',
  register: 'katalog',
  question: 'Warum und wohin, und wie haben Entscheidungen gewirkt?',
  fills: P6,
  spec: 'Katalog der 30 Reports als Stückliste in fünf Baugruppen.',
};

export const REPORT_GROUP_PAGES = REPORT_GROUPS.map((g) => ({
  slug: g.slug,
  meta: {
    title: `Reports · ${g.name}`,
    area: 'reports' as const,
    register: g.slug,
    question: `${g.items.length} Zeichnungen`,
    fills: P6,
    spec: 'Reports dieser Baugruppe.',
  } satisfies PageMeta,
}));

export const ACCOUNT_PAGE: PageMeta = {
  title: 'Konto',
  area: 'konten',
  register: 'uebersicht',
  question: 'Saldo, Verlauf und Buchungen eines Kontos.',
  fills: P2,
  spec: 'Einzelkonto mit 90-Tage-Stufenlinie, Buchungsliste und „Kontostand prüfen“.',
};

export const REPORT_PAGE_FILLS = P6;
