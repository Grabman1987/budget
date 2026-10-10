import { isMonth } from '../nav/month';

const id = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : undefined;
const ids = (value: unknown) =>
  Array.isArray(value) && value.length <= 500
    ? value.filter((value): value is string => id(value) !== undefined)
    : undefined;

export const validateReportSearch = (search: Record<string, unknown>) => ({
  kategorien: ids(search['kategorien']),
  gruppen: ids(search['gruppen']),
  vorjahr: search['vorjahr'] === true || search['vorjahr'] === 'true' ? true : undefined,
  gehaltszettel: id(search['gehaltszettel']),
  zettel: id(search['zettel']),
  zelle:
    typeof search['zelle'] === 'string' &&
    /^(inc|exp|net|(inc|cat|group):.{1,64})$/.test(search['zelle'])
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
