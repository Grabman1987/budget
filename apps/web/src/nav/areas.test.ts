import { describe, expect, it } from 'vitest';
import { AREAS, areaById } from './areas';
import { REPORTS } from './reports-catalog';

describe('area registers', () => {
  it('keeps the short Plan and Konten registers in owner order', () => {
    expect(areaById('plan').registers.map(({ label }) => label)).toEqual([
      'Monat',
      'Jahr',
      'Zahlungen',
      'Ziele',
      'Prognose',
    ]);
    expect(areaById('konten').registers.map(({ label }) => label)).toEqual([
      'Übersicht',
      'Buchungen',
      'Prüfen',
      'Kontakte',
    ]);
  });

  it.each(AREAS)('$label registers never leave their area', (area) => {
    for (const register of area.registers) {
      expect(register.to === `/${area.id}` || register.to.startsWith(`/${area.id}/`)).toBe(true);
    }
  });

  it('moves the forecast out of the report catalog without renumbering retained reports', () => {
    expect(REPORTS.some(({ id }) => id === 'liquiditaet')).toBe(false);
    expect(REPORTS.find(({ id }) => id === 'cashflow')?.pos).toBe('3.2');
  });
});
