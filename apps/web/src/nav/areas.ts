import { ChartColumn, Home, Landmark, Table2, TrendingUp, type LucideIcon } from 'lucide-react';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

/** The five areas of the sitemap (SPEC §3) plus settings. Same order on desktop and phone. */
export type AreaId = 'heute' | 'plan' | 'konten' | 'vermoegen' | 'reports' | 'einstellungen';

export interface RegisterDef {
  id: string;
  label: string;
  to: string;
  search?: Record<string, string>;
}

export interface AreaDef {
  id: AreaId;
  label: string;
  /** Sheet number in the "Planliste"; settings has none. */
  no?: string;
  to: string;
  icon?: LucideIcon;
  registers: ReadonlyArray<RegisterDef>;
}

export const AREAS: ReadonlyArray<AreaDef> = [
  { id: 'heute', label: 'Heute', no: '01', to: '/', icon: Home, registers: [] },
  {
    id: 'plan',
    label: 'Plan',
    no: '02',
    to: '/plan/monat',
    icon: Table2,
    registers: [
      { id: 'monat', label: 'Monat', to: '/plan/monat' },
      { id: 'jahr', label: 'Jahr', to: '/plan/jahr' },
      { id: 'erwartet', label: 'Zahlungen', to: '/plan/erwartet' },
      { id: 'sparziele', label: 'Ziele', to: '/plan/sparziele' },
      { id: 'prognose', label: 'Prognose', to: '/plan/prognose' },
    ],
  },
  {
    id: 'konten',
    label: 'Konten',
    no: '03',
    to: '/konten',
    icon: Landmark,
    registers: [
      { id: 'uebersicht', label: 'Übersicht', to: '/konten' },
      { id: 'buchungen', label: 'Buchungen', to: '/konten/buchungen' },
      { id: 'pruefen', label: 'Prüfen', to: '/konten/pruefen' },
      { id: 'kontakte', label: 'Kontakte', to: '/konten/kontakte' },
    ],
  },
  {
    id: 'vermoegen',
    label: 'Vermögen',
    no: '04',
    to: '/vermoegen/nettovermoegen',
    icon: TrendingUp,
    registers: [
      { id: 'nettovermoegen', label: 'Nettovermögen', to: '/vermoegen/nettovermoegen' },
      { id: 'portfolio', label: 'Portfolio', to: '/vermoegen/portfolio' },
      { id: 'schulden', label: 'Schulden', to: '/vermoegen/schulden' },
      { id: 'freiheit', label: 'Freiheit', to: '/vermoegen/freiheit' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    no: '05',
    to: '/reports',
    icon: ChartColumn,
    registers: [],
  },
  {
    id: 'einstellungen',
    label: 'Einstellungen',
    to: REDESIGN_ENABLED ? '/einstellungen/profil' : '/einstellungen/konten',
    registers: [
      { id: 'konten', label: 'Konten', to: '/einstellungen/konten' },
      ...(REDESIGN_ENABLED
        ? [{ id: 'kontakte', label: 'Kontakte', to: '/einstellungen/kontakte' }]
        : []),
      { id: 'projekte', label: 'Projekte', to: '/einstellungen/projekte' },
      { id: 'warenkorb', label: 'Warenkorb (Teuerung)', to: '/einstellungen/warenkorb' },
      { id: 'kategorien', label: 'Kategorien', to: '/einstellungen/kategorien' },
      { id: 'regelwerk', label: 'Regelwerk', to: '/einstellungen/regelwerk' },
      { id: 'zuordnung', label: 'Zuordnungsregeln', to: '/einstellungen/zuordnung' },
      { id: 'datenquellen', label: 'Datenquellen', to: '/einstellungen/datenquellen' },
      ...(REDESIGN_ENABLED
        ? [
            {
              id: 'zielallokation',
              label: 'Zielallokation und Stufen',
              to: '/einstellungen/anlageklassen',
              search: { ansicht: 'stufen' },
            },
          ]
        : []),
      { id: 'anlageklassen', label: 'Anlageklassen', to: '/einstellungen/anlageklassen' },
      { id: 'export', label: 'CSV-Export', to: '/einstellungen/export' },
      { id: 'sicherheit', label: 'Sicherheit', to: '/einstellungen/sicherheit' },
      { id: 'depots', label: 'Depots & Kryptos', to: '/einstellungen/depots' },
      { id: 'profil', label: 'Profil', to: '/einstellungen/profil' },
    ],
  },
];

/** The five main areas shown in sidebar and tab bar (settings live in the profile menu). */
export const MAIN_AREAS = AREAS.filter((a) => a.no !== undefined);

export const areaById = (id: AreaId): AreaDef => {
  const area = AREAS.find((a) => a.id === id);
  if (!area) throw new Error(`Unknown area ${id}`);
  return area;
};

/** Einstellungen are navigated in groups (left rail on desktop, index list on the phone). */
export interface SettingsGroup {
  id: string;
  label: string;
  items: ReadonlyArray<RegisterDef>;
}

/** Register ids of Einstellungen per group, in display order. Every register is in exactly one. */
const SETTINGS_GROUP_IDS: ReadonlyArray<{ id: string; label: string; registers: string[] }> =
  REDESIGN_ENABLED
    ? [
        { id: 'profil', label: 'Profil & Sicherheit', registers: ['profil', 'sicherheit'] },
        { id: 'konten', label: 'Konten & Depots', registers: ['konten', 'depots', 'kontakte'] },
        {
          id: 'regeln',
          label: 'Kategorien & Regeln',
          registers: ['kategorien', 'regelwerk', 'zuordnung', 'warenkorb'],
        },
        { id: 'verbindungen', label: 'Verbindungen', registers: ['datenquellen'] },
        { id: 'vermoegen', label: 'Vermögen', registers: ['zielallokation', 'anlageklassen'] },
        { id: 'daten', label: 'Daten', registers: ['export', 'projekte'] },
      ]
    : [
        {
          id: 'daten',
          label: 'Daten',
          registers: [
            'konten',
            ...(REDESIGN_ENABLED ? ['kontakte'] : []),
            'kategorien',
            'warenkorb',
            'projekte',
            'anlageklassen',
            'depots',
          ],
        },
        {
          id: 'automatik',
          label: 'Automatik',
          registers: ['regelwerk', 'zuordnung', 'datenquellen'],
        },
        { id: 'system', label: 'System', registers: ['sicherheit', 'export', 'profil'] },
      ];

export const SETTINGS_GROUPS: ReadonlyArray<SettingsGroup> = SETTINGS_GROUP_IDS.map((group) => ({
  id: group.id,
  label: group.label,
  items: group.registers.map((id) => {
    const register = areaById('einstellungen').registers.find((r) => r.id === id);
    if (!register) throw new Error(`Unknown settings register ${id}`);
    return register;
  }),
}));
