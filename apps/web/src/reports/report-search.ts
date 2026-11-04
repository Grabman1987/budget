import { isMonth, monthOf } from '../nav/month';
import { isExplorerTemplate } from '@budget/domain';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

export const FINANZCHECK_HEADING_HASHES: readonly string[] = [
  'r07-title',
  'fc-stage',
  'fc-today',
  'fc-actions',
  'fc-matrix',
];

const id = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
const ids = (value: unknown) =>
  Array.isArray(value) && value.length <= 500
    ? value.filter((value): value is string => id(value) !== undefined)
    : undefined;

/** Retain the original monthly section bookmarks when the default summary is active. */
export function isPaperPresentation(view: unknown, hash: string): boolean {
  return REDESIGN_ENABLED && (view === 'druckblatt' || /^ps-[a-g]$/.test(hash));
}

/** Same historical-month period as the existing reader, before it can replace a heading hash. */
export function normalizeHistoryPeriod(search: Record<string, unknown>): boolean {
  return (
    REDESIGN_ENABLED &&
    search['darstellung'] === 'finanzcheck' &&
    isMonth(search['monat']) &&
    search['monat'] !== monthOf(new Date()) &&
    search['period'] !== 'month'
  );
}

export const validateReportSearch = (search: Record<string, unknown>) => ({
  ...(REDESIGN_ENABLED
    ? {
        kontakteansicht: search['kontakteansicht'] === 'offen' ? 'offen' : undefined,
        verlauf: search['verlauf'] === 1 || search['verlauf'] === '1' ? 1 : undefined,
        inflationsansicht:
          search['inflationsansicht'] === 'basket' || search['inflationsansicht'] === 'explorer'
            ? (search['inflationsansicht'] as 'basket' | 'explorer')
            : undefined,
        warenkorb:
          search['warenkorb'] === 'base' || search['warenkorb'] === 'year'
            ? (search['warenkorb'] as 'base' | 'year')
            : undefined,
      }
    : {}),
  ansicht: id(search['ansicht']),
  empfaenger: id(search['empfaenger']),
  projekt: id(search['projekt']),
  projektUngueltig:
    search['projektUngueltig'] === true ||
    search['projektUngueltig'] === 'true' ||
    (search['projekt'] !== undefined && id(search['projekt']) === undefined)
      ? true
      : undefined,
  darstellung: [
    'income',
    'overview',
    'cashflow',
    'projekte',
    'rendite',
    'verteilung',
    'einzahlungen',
    'gruppen',
    'empfaenger',
    'bilanz',
    'verlauf',
    'gesamt',
    'budget',
    'planungstreue',
    'vertraege',
    'bankkosten',
    ...(REDESIGN_ENABLED
      ? [
          'eigene',
          'finanzcheck',
          'druckblatt',
          'schulden',
          'freiheit',
          'kennzahlen',
          'klassen',
          'ertraege',
          'gebuehren',
          'kostenverlauf',
        ]
      : []),
  ].includes(search['darstellung'] as string)
    ? (search['darstellung'] as
        | 'income'
        | 'overview'
        | 'cashflow'
        | 'projekte'
        | 'rendite'
        | 'verteilung'
        | 'einzahlungen'
        | 'gruppen'
        | 'empfaenger'
        | 'bilanz'
        | 'verlauf'
        | 'gesamt'
        | 'budget'
        | 'planungstreue'
        | 'vertraege'
        | 'bankkosten'
        | 'eigene'
        | 'finanzcheck'
        | 'druckblatt'
        | 'schulden'
        | 'freiheit'
        | 'kennzahlen'
        | 'klassen'
        | 'ertraege'
        | 'gebuehren'
        | 'kostenverlauf')
    : undefined,
  vorlage: isExplorerTemplate(search['vorlage']) ? search['vorlage'] : undefined,
  exakt: search['exakt'] === true || search['exakt'] === 'true' ? true : undefined,
  kategorien: ids(search['kategorien']),
  gruppen: ids(search['gruppen']),
  vorjahr: search['vorjahr'] === true || search['vorjahr'] === 'true' ? true : undefined,
  gehaltszettel: id(search['gehaltszettel']),
  zettel: id(search['zettel']),
  zelle:
    typeof search['zelle'] === 'string' &&
    /^(inc|exp|net|need|want|future|cons|rest|(inc|cat|group|memo|need|want|future):.{1,64})$/.test(
      search['zelle'],
    )
      ? search['zelle']
      : undefined,
  spalte:
    search['spalte'] === 'summe' || isMonth(search['spalte'])
      ? (search['spalte'] as string)
      : undefined,
  kontakt:
    typeof search['kontakt'] === 'string' &&
    search['kontakt'].length > 0 &&
    search['kontakt'].length <= 100
      ? search['kontakt']
      : undefined,
});
