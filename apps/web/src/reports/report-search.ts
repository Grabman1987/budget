import { isMonth, monthOf } from '../nav/month';
import { isExplorerTemplate, todayInVienna } from '@budget/domain';
import { z } from 'zod';
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

export const spendingComparisonWindow = z
  .object({ von: z.iso.date(), bis: z.iso.date() })
  .refine(({ von, bis }) => von <= bis && bis <= todayInVienna());

function spendingComparisonSearch(search: Record<string, unknown>) {
  const result = spendingComparisonWindow.safeParse({
    von: search['vergleichVon'],
    bis: search['vergleichBis'],
  });
  if (search['vergleich'] === 'eigen' && result.success)
    return {
      vergleich: 'eigen' as const,
      vergleichVon: result.data.von,
      vergleichBis: result.data.bis,
    };
  return { vergleich: search['vergleich'] === 'vorjahr' ? ('vorjahr' as const) : undefined };
}

export const validateReportSearch = (search: Record<string, unknown>) => ({
  ...(REDESIGN_ENABLED
    ? {
        kontakteansicht: search['kontakteansicht'] === 'offen' ? 'offen' : undefined,
        ...spendingComparisonSearch(search),
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
    'vertraege',
    'bankkosten',
    ...(REDESIGN_ENABLED
      ? [
          'eigene',
          'kategorien',
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
        | 'vertraege'
        | 'bankkosten'
        | 'eigene'
        | 'kategorien'
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

/** Retired report views keep their URL context at the existing wealth destinations. */
export function wealthReportDestination(reportId: string, view: unknown): string | undefined {
  if (!REDESIGN_ENABLED || reportId !== 'vermoegen-schulden') return undefined;
  if (view === 'freiheit') return '/vermoegen/freiheit';
  if (view === 'schulden') return '/vermoegen/schulden';
  return undefined;
}
