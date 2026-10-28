import { expect, it } from 'vitest';
import { validateReportSearch } from './report-search';

it.each(['budget', 'planungstreue', 'vertraege', 'bankkosten'])(
  'retains %s independently of saved views, exact windows and project identity',
  (darstellung) => {
    for (const exakt of [true, 'true']) {
      expect(
        validateReportSearch({ darstellung, exakt, ansicht: 'saved-id', projekt: 'project-id' }),
      ).toMatchObject({ darstellung, exakt: true, ansicht: 'saved-id', projekt: 'project-id' });
    }
    expect(validateReportSearch({ darstellung, projekt: '' })).toMatchObject({
      darstellung,
      projekt: undefined,
      projektUngueltig: true,
    });
    expect(validateReportSearch({ darstellung, projektUngueltig: 'true' })).toMatchObject({
      darstellung,
      projektUngueltig: true,
    });
  },
);

it('keeps existing variants and rejects an unknown representation', () => {
  for (const darstellung of [
    'income',
    'overview',
    'cashflow',
    'gruppen',
    'empfaenger',
    'bilanz',
    'verlauf',
    'gesamt',
  ]) {
    expect(validateReportSearch({ darstellung }).darstellung).toBe(darstellung);
  }
  expect(validateReportSearch({ darstellung: 'unknown', exakt: 'false' })).toMatchObject({
    darstellung: undefined,
    exakt: undefined,
  });
});
