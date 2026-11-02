/**
 * Independent browser-test contract from Main d12dec68. Keep Node collection free of Vite-only
 * application modules; the parity regression compares this literal contract with the actual app.
 */
export const LEGACY_PAGE_PATHS = [
  '/plan/monat',
  '/plan/jahr',
  '/plan/erwartet',
  '/plan/sparziele',
  '/plan/prognose',
  '/konten',
  '/konten/buchungen',
  '/konten/pruefen',
  '/konten/kontakte',
  '/vermoegen/nettovermoegen',
  '/vermoegen/portfolio',
  '/vermoegen/schulden',
  '/vermoegen/freiheit',
  '/einstellungen/profil',
  '/einstellungen/konten',
  '/einstellungen/depots',
  '/einstellungen/projekte',
  '/einstellungen/warenkorb',
  '/einstellungen/kategorien',
  '/einstellungen/regelwerk',
  '/einstellungen/zuordnung',
  '/einstellungen/datenquellen',
  '/einstellungen/anlageklassen',
  '/einstellungen/export',
  '/einstellungen/sicherheit',
] as const;

export const CONTACT_SETTINGS_PATH = '/einstellungen/kontakte';

interface ExpectedSettingsItem {
  id: string;
  label: string;
  to: string;
  search?: Record<string, string>;
}
interface ExpectedSettingsGroup {
  id: string;
  label: string;
  items: readonly ExpectedSettingsItem[];
}

const LEGACY_SETTINGS_GROUPS: readonly ExpectedSettingsGroup[] = [
  {
    id: 'daten',
    label: 'Daten',
    items: [
      { id: 'konten', label: 'Konten', to: '/einstellungen/konten' },
      { id: 'kategorien', label: 'Kategorien', to: '/einstellungen/kategorien' },
      { id: 'warenkorb', label: 'Warenkorb (Teuerung)', to: '/einstellungen/warenkorb' },
      { id: 'projekte', label: 'Projekte', to: '/einstellungen/projekte' },
      { id: 'anlageklassen', label: 'Anlageklassen', to: '/einstellungen/anlageklassen' },
      { id: 'depots', label: 'Depots & Kryptos', to: '/einstellungen/depots' },
    ],
  },
  {
    id: 'automatik',
    label: 'Automatik',
    items: [
      { id: 'regelwerk', label: 'Regelwerk', to: '/einstellungen/regelwerk' },
      { id: 'zuordnung', label: 'Zuordnungsregeln', to: '/einstellungen/zuordnung' },
      { id: 'datenquellen', label: 'Datenquellen', to: '/einstellungen/datenquellen' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'sicherheit', label: 'Sicherheit', to: '/einstellungen/sicherheit' },
      { id: 'export', label: 'CSV-Export', to: '/einstellungen/export' },
      { id: 'profil', label: 'Profil', to: '/einstellungen/profil' },
    ],
  },
];

/** The caller reads the actual rendered build marker after navigation, never a Node env flag. */
export function expectedSettingsGroups(redesign: boolean): readonly ExpectedSettingsGroup[] {
  if (!redesign) return LEGACY_SETTINGS_GROUPS;
  const legacy = LEGACY_SETTINGS_GROUPS.flatMap((group) => group.items);
  const item = (id: string) => legacy.find((entry) => entry.id === id)!;
  return [
    { id: 'profil', label: 'Profil & Sicherheit', items: [item('profil'), item('sicherheit')] },
    {
      id: 'konten',
      label: 'Konten & Depots',
      items: [
        item('konten'),
        item('depots'),
        { id: 'kontakte', label: 'Kontakte', to: CONTACT_SETTINGS_PATH },
      ],
    },
    {
      id: 'regeln',
      label: 'Kategorien & Regeln',
      items: [item('kategorien'), item('regelwerk'), item('zuordnung'), item('warenkorb')],
    },
    { id: 'verbindungen', label: 'Verbindungen', items: [item('datenquellen')] },
    {
      id: 'vermoegen',
      label: 'Vermögen',
      items: [
        {
          id: 'zielallokation',
          label: 'Zielallokation und Stufen',
          to: '/einstellungen/anlageklassen',
          search: { ansicht: 'stufen' },
        },
        item('anlageklassen'),
      ],
    },
    { id: 'daten', label: 'Daten', items: [item('export'), item('projekte')] },
  ];
}
