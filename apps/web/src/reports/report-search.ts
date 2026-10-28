import { isMonth } from '../nav/month';
import { isExplorerTemplate } from '@budget/domain';

const id = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
const ids = (value: unknown) =>
  Array.isArray(value) && value.length <= 500
    ? value.filter((value): value is string => id(value) !== undefined)
    : undefined;

export const validateReportSearch = (search: Record<string, unknown>) => ({
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
    'gruppen',
    'empfaenger',
    'bilanz',
    'verlauf',
    'gesamt',
    'budget',
    'planungstreue',
    'vertraege',
    'bankkosten',
  ].includes(search['darstellung'] as string)
    ? (search['darstellung'] as
        | 'income'
        | 'overview'
        | 'cashflow'
        | 'gruppen'
        | 'empfaenger'
        | 'bilanz'
        | 'verlauf'
        | 'gesamt'
        | 'budget'
        | 'planungstreue'
        | 'vertraege'
        | 'bankkosten')
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
