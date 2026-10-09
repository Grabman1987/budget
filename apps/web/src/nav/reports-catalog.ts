/** Catalog of the reports (SPEC §7; 3.6 Vermögen & Schulden was added after the original 30), ported from design/prototype/reports.js. UI text is German. */

export type ReportControl = 'month' | 'year' | 'period' | 'print';

export interface ReportEntry {
  id: string;
  /** Position in the catalog, e.g. "1.1". */
  pos: string;
  name: string;
  question: string;
  form: string;
  controls: ReadonlyArray<ReportControl>;
}

export interface ReportGroup {
  /** Register slug, used in `/reports/gruppe/$group`. */
  slug: string;
  no: number;
  name: string;
  items: ReadonlyArray<ReportEntry>;
}

type Raw = [id: string, name: string, question: string, form: string, ...controls: ReportControl[]];

const group = (slug: string, no: number, name: string, raw: Raw[]): ReportGroup => ({
  slug,
  no,
  name,
  items: raw.map(([id, itemName, question, form, ...controls], i) => ({
    id,
    pos: `${no}.${i + 1}`,
    name: itemName,
    question,
    form,
    controls,
  })),
});

export const REPORT_GROUPS: ReadonlyArray<ReportGroup> = [
  group('monat', 1, 'Monat und Einkommen', [
    [
      'onepager',
      'Monats-One-Pager',
      'Wie lief der Monat, auf einem Blatt?',
      'Druckblatt A4',
      'month',
      'print',
    ],
    [
      'gehalt',
      'Gehaltsreport',
      'Was bleibt vom Brutto, und wie hat es sich entwickelt?',
      'Maßkette Brutto → Netto, Stufenlinie',
      'month',
    ],
    [
      'einnahmen',
      'Einnahmen',
      'Woher kommt das Geld, kam alles Erwartete?',
      'Gestapelte Säulen, Soll/Ist-Liste',
      'month',
    ],
    ['geldfluss', 'Geldfluss', 'Wohin fließt das Geld?', 'Sankey', 'month'],
    [
      'jahresansicht',
      'Jahresansicht',
      'Wie verteilt sich ein Jahr über die Monate?',
      'Heatmap Kategorie × Monat',
      'year',
    ],
    [
      'kategorien',
      'Kategorieübersicht',
      'Wie verhält sich jede Kategorie?',
      'Liste mit Verlaufslinie',
      'period',
    ],
    [
      'sparquote',
      'Sparquote und Geldalter',
      'Wie viel bleibt, und wie alt ist das ausgegebene Geld?',
      'Zwei Linien mit Zielmarke',
      'period',
    ],
    [
      'gesamttabelle',
      'Gesamttabelle',
      'Alle Zahlen, alle Monate, in einer Tabelle.',
      'Tabelle, 36 Monate',
    ],
    [
      'projekte',
      'Projekte und Nebeneinkünfte',
      'Was bringen die Nebenprojekte unterm Strich?',
      'Gewinn und Verlust je Projekt',
      'period',
    ],
    [
      'einnahmen-ausgaben',
      'Einnahmen und Ausgaben',
      'Was bleibt nach den Ausgaben?',
      'Monatstabelle, Säulen und Nettolinie',
      'period',
    ],
    [
      'planungstreue',
      'Prognosegenauigkeit',
      'Wie treffsicher ist die Hochrechnung am 15.?',
      'Monatliche Abweichungsbalken, Prognose/Ist-Tabelle',
      'month',
    ],
  ]),
  group('ausgaben', 2, 'Ausgaben und Plan', [
    [
      'ausgaben',
      'Ausgabenanalyse',
      'Wofür geben wir Geld aus?',
      'Balken sortiert, Klassenbalken, Heatmap',
      'period',
    ],
    [
      'budgettreue',
      'Budgettreue',
      'Halten wir den Plan, stimmt 50/30/20?',
      'Bullet-Balken, 100-%-Balken',
      'month',
    ],
    [
      'abos',
      'Verträge und Abos',
      'Welche Verträge binden uns, und was lässt sich kündigen?',
      'Stückliste mit Fristen, Fremdwährung',
    ],
    [
      'inflation',
      'Persönliche Inflation',
      'Wie stark steigen unsere Preise?',
      'Indexlinie gegen VPI',
    ],
    [
      'empfaenger',
      'Empfänger-Analyse',
      'Bei wem lassen wir das meiste Geld?',
      'Balken sortiert, Bon-Statistik',
      'period',
    ],
    [
      'kosten',
      'Bank- und Zinskosten',
      'Was kostet uns das Geld selbst?',
      'Segmentierte Balken je Jahr',
    ],
  ]),
  group('zukunft', 3, 'Zukunft und Vermögen', [
    [
      'liquiditaet',
      'Liquiditätsprognose',
      'Geht sich das aus, auch mit geplanten Ereignissen?',
      'Linie mit Band, Ereignisse, Urteil',
    ],
    [
      'cashflow',
      'Cashflow-Verlauf',
      'Verdienen wir mehr, als wir ausgeben?',
      'Säulen, Linie, Balken um Null',
      'period',
    ],
    [
      'vermoegen',
      'Vermögensverläufe',
      'Woraus besteht das Vermögen über die Zeit?',
      'Gestapelte Fläche nach Kontotyp',
      'period',
    ],
    [
      'vorschau',
      'Jahresvorschau Zahlungen',
      'Welche Zahlungen kommen in den nächsten 12 Monaten?',
      'Zahlungskalender',
    ],
    [
      'sparziele',
      'Sparziele-Fortschritt',
      'Liegen die Sparziele im Plan?',
      'Fortschrittsbalken mit Soll-Marke',
    ],
    [
      'vermoegen-schulden',
      'Vermögen & Schulden',
      'Was besitzen wir, was schulden wir, und wie entwickelt sich der Saldo?',
      'Balken je Monatsende, Linie Nettovermögen',
      'period',
    ],
  ]),
  group('portfolio', 4, 'Portfolio', [
    [
      'pdepots',
      'Depots im Vergleich',
      'Wie schlägt sich jedes Depot?',
      'Depots nebeneinander',
      'period',
    ],
    [
      'pallocation',
      'Allocation',
      'Woraus besteht das Portfolio, und wie weit weg vom Soll?',
      'Sonnendiagramm, Soll/Ist über Zeit',
    ],
    [
      'peinzahlungen',
      'Einzahlungen und Wert',
      'Was haben wir eingezahlt, was ist es wert?',
      'Stufenlinie gegen Wertlinie',
      'period',
    ],
    [
      'prendite',
      'Rendite und Kennzahlen',
      'Wie gut, wie riskant, gegen welchen Index?',
      'Indexlinien, Kennzahlen, Heatmap',
      'period',
    ],
    [
      'psteuern',
      'Kosten, Steuern, Erträge',
      'Was bleibt nach Gebühren und Steuern?',
      'Maßkette, Stückliste je Produkt',
    ],
  ]),
  group('ueberblick', 5, 'Überblick', [
    [
      'jahresreport',
      'Jahresreport',
      'Wie lief das Jahr?',
      'Druckblatt A4, 2 Blätter',
      'year',
      'print',
    ],
    [
      'finanzcheck',
      'Finanz-Check-Verlauf',
      'Welche Regeln sind verletzt, seit wann?',
      'Regelliste mit Statusleiste',
    ],
    ['explorer', 'Explorer', 'Eigene Frage, eigene Tabelle.', 'Pivot mit gespeicherten Ansichten'],
    ['kontakte', 'Kontakte-Abrechnung', 'Wer schuldet wem wie viel?', 'Saldenlinie, Kontoblatt'],
    ['vergleich', 'Zeitraumvergleich', 'Was hat sich gegenüber damals geändert?', 'Balken um Null'],
    [
      'gesamtuebersicht',
      'Gesamtübersicht',
      'Was haben Sparen und Markt zum Vermögen beigetragen?',
      'Monatsbalken und Nettovermögen',
      'period',
    ],
  ]),
];

// Keep published report numbers stable; the new overview leads its section.
const overviewGroup = REPORT_GROUPS.find((g) => g.slug === 'ueberblick')!;
overviewGroup.items = [overviewGroup.items.at(-1)!, ...overviewGroup.items.slice(0, -1)];

export const REPORTS: ReadonlyArray<ReportEntry & { group: ReportGroup }> = REPORT_GROUPS.flatMap(
  (g) => g.items.map((item) => ({ ...item, group: g })),
);

export const findReport = (id: string) => REPORTS.find((r) => r.id === id);
export const findReportGroup = (slug: string) => REPORT_GROUPS.find((g) => g.slug === slug);
