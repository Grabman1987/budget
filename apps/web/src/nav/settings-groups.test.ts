import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS, areaById } from './areas';
import { PAGES } from './pages';

describe('settings groups', () => {
  const registers = areaById('einstellungen').registers;
  const grouped = SETTINGS_GROUPS.flatMap((group) => group.items);

  it('lists every settings page exactly once', () => {
    expect(grouped.map((item) => item.id).sort()).toEqual(registers.map((r) => r.id).sort());
    expect(new Set(grouped.map((item) => item.id)).size).toBe(grouped.length);
  });

  it('covers every settings route of the sitemap', () => {
    const paths = PAGES.filter((page) => page.area === 'einstellungen').map((page) => page.path);
    expect(grouped.map((item) => item.to).sort()).toEqual(paths.sort());
  });

  it('keeps the groups and their order', () => {
    expect(
      SETTINGS_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
    ).toEqual([
      ['Daten', ['Konten', 'Kategorien', 'Projekte', 'Anlageklassen', 'Depots & Kryptos']],
      ['Automatik', ['Regelwerk', 'Zuordnungsregeln', 'Datenquellen']],
      ['System', ['Sicherheit', 'CSV-Export', 'Profil']],
    ]);
  });

  it('keeps the existing URLs', () => {
    expect(Object.fromEntries(grouped.map((item) => [item.id, item.to]))).toEqual({
      konten: '/einstellungen/konten',
      kategorien: '/einstellungen/kategorien',
      projekte: '/einstellungen/projekte',
      anlageklassen: '/einstellungen/anlageklassen',
      depots: '/einstellungen/depots',
      regelwerk: '/einstellungen/regelwerk',
      zuordnung: '/einstellungen/zuordnung',
      datenquellen: '/einstellungen/datenquellen',
      sicherheit: '/einstellungen/sicherheit',
      export: '/einstellungen/export',
      profil: '/einstellungen/profil',
    });
  });
});
