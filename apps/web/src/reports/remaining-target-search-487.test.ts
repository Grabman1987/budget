import { expect, it } from 'vitest';
import { findReport } from '../nav/reports-catalog';
import { validateReportSearch } from './report-search';

it.each(['projekte', 'rendite', 'verteilung', 'einzahlungen'])(
  'retains %s without consuming exact-window, saved-view or project identity',
  (darstellung) => {
    for (const exakt of [true, 'true']) {
      expect(
        validateReportSearch({ darstellung, exakt, ansicht: 'server-id', projekt: 'a' }),
      ).toMatchObject({ darstellung, exakt: true, ansicht: 'server-id', projekt: 'a' });
    }
    for (const projekt of ['', 'x'.repeat(65), 12]) {
      expect(validateReportSearch({ darstellung, projekt })).toMatchObject({
        darstellung,
        projekt: undefined,
        projektUngueltig: true,
      });
    }
    expect(validateReportSearch({ darstellung, projektUngueltig: 'true' })).toMatchObject({
      darstellung,
      projektUngueltig: true,
    });
  },
);

it('uses canonical catalog names for loader, document and phone titles, retaining old readers', () => {
  expect(findReport('einnahmen-ausgaben')?.name).toBe('Einnahmen und Cashflow');
  expect(findReport('pallocation')?.name).toBe('Portfolio-Auswertung');
  expect(findReport('projekte')?.name).toBe('Projekte und Nebeneinkünfte');
  expect(findReport('prendite')?.name).toBe('Rendite und Kennzahlen');
  expect(findReport('peinzahlungen')?.name).toBe('Einzahlungen und Wert');
  expect(
    validateReportSearch({ darstellung: 'unknown', exakt: 'false' }).darstellung,
  ).toBeUndefined();
});
