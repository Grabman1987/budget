import { findReport, type ReportEntry } from '../nav/reports-catalog';

/** Navigation only: report bodies and their financial queries remain independent. */
export const HUB_GROUPS = [
  { id: 'income', name: 'Einnahmen/Ausgaben' },
  { id: 'wealth', name: 'Vermögen' },
  { id: 'portfolio', name: 'Portfolio' },
  { id: 'reports', name: 'Berichte' },
] as const;
export type HubGroup = (typeof HUB_GROUPS)[number]['id'];
export interface HubReport {
  id: string;
  no: number;
  group: HubGroup;
  name: string;
  question: string;
  sources: readonly string[];
}

/** Owner mapping in #487; content consolidation belongs to #621–623, not this catalog. */
export const HUB_REPORTS: readonly HubReport[] = [
  { id: 'einnahmen-ausgaben', no: 1, group: 'income', name: 'Einnahmen und Cashflow', question: 'Woher kommt das Geld, und was bleibt nach den Ausgaben?', sources: ['einnahmen', 'einnahmen-ausgaben', 'cashflow', 'projekte'] },
  { id: 'ausgaben', no: 2, group: 'income', name: 'Ausgabenanalyse', question: 'Wofür und bei wem geben wir Geld aus?', sources: ['ausgaben', 'empfaenger'] },
  { id: 'gehalt', no: 3, group: 'income', name: 'Gehalt', question: 'Was bleibt vom Brutto, und wie hat es sich entwickelt?', sources: ['gehalt'] },
  { id: 'geldfluss', no: 4, group: 'income', name: 'Geldfluss', question: 'Wohin fließt das Geld?', sources: ['geldfluss'] },
  { id: 'sparquote', no: 5, group: 'income', name: 'Sparquote und Geldalter', question: 'Wie viel bleibt, und wie alt ist das ausgegebene Geld?', sources: ['sparquote'] },
  { id: 'budgettreue', no: 6, group: 'income', name: 'Budgettreue', question: 'Halten wir den Plan, und wie treffsicher ist die Prognose?', sources: ['budgettreue', 'planungstreue'] },
  { id: 'abos', no: 7, group: 'income', name: 'Verträge und Kosten', question: 'Welche Verträge binden uns, und was kostet uns das Geld?', sources: ['abos', 'kosten'] },
  { id: 'inflation', no: 8, group: 'income', name: 'Persönliche Inflation', question: 'Wie stark steigen unsere Preise?', sources: ['inflation'] },
  { id: 'vermoegen-schulden', no: 9, group: 'wealth', name: 'Vermögen und Schulden', question: 'Was besitzen wir, was schulden wir, und wie entwickelt sich der Saldo?', sources: ['vermoegen', 'vermoegen-schulden', 'gesamtuebersicht'] },
  { id: 'pdepots', no: 10, group: 'portfolio', name: 'Depots im Vergleich', question: 'Wie schlägt sich jedes Depot?', sources: ['pdepots'] },
  { id: 'pallocation', no: 11, group: 'portfolio', name: 'Portfolio-Auswertung', question: 'Wie entwickeln sich Aufteilung, Einzahlungen, Wert und Rendite?', sources: ['pallocation', 'peinzahlungen', 'prendite'] },
  { id: 'psteuern', no: 12, group: 'portfolio', name: 'Kosten, Steuern, Erträge', question: 'Was bleibt nach Gebühren und Steuern?', sources: ['psteuern'] },
  { id: 'explorer', no: 13, group: 'reports', name: 'Auswertung', question: 'Wie verhalten sich Kategorien und Monate in einer eigenen Tabelle?', sources: ['explorer', 'kategorien', 'jahresansicht', 'gesamttabelle'] },
  { id: 'vergleich', no: 14, group: 'reports', name: 'Zeitraumvergleich', question: 'Was hat sich gegenüber damals geändert?', sources: ['vergleich'] },
  { id: 'onepager', no: 15, group: 'reports', name: 'Monatsbericht', question: 'Wie lief der Monat, auf einem Blatt?', sources: ['onepager'] },
  { id: 'jahresreport', no: 16, group: 'reports', name: 'Jahresbericht', question: 'Wie lief das Jahr?', sources: ['jahresreport'] },
];

export const hubReport = (id: string) => HUB_REPORTS.find((report) => report.sources.includes(id));
export const matchingHubReports = (search: string, group?: HubGroup) => {
  const query = search.trim().toLocaleLowerCase('de-AT');
  return HUB_REPORTS.filter((report) => (!group || report.group === group) &&
    `${report.name} ${report.question}`.toLocaleLowerCase('de-AT').includes(query));
};
const RECENTS_KEY = 'budget.reports.recent.v1';

/** Store at most three public catalog IDs, never query parameters or report data. */
export function recentReports(): ReportEntry[] {
  try {
    const raw = sessionStorage.getItem(RECENTS_KEY);
    if (!raw || raw.length > 1024) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const ids = [...new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(findReport(id))))].slice(0, 3);
    return ids.flatMap((id) => findReport(id) ?? []);
  } catch { return []; }
}
export function rememberReport(id: string) {
  const report = findReport(id);
  if (!report) return;
  try {
    sessionStorage.setItem(RECENTS_KEY, JSON.stringify([report.id, ...recentReports().filter((item) => item.id !== report.id).map((item) => item.id)].slice(0, 3)));
  } catch { /* Navigation also works when browser storage is unavailable. */ }
}
