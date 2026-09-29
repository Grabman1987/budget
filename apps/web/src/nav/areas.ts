import { BarChart3, Home, Landmark, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';

/** The five areas of the sitemap (SPEC §3) plus settings. Same order on desktop and phone. */
export type AreaId = 'heute' | 'plan' | 'konten' | 'vermoegen' | 'reports' | 'einstellungen';

export interface RegisterDef {
  id: string;
  label: string;
  to: string;
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
    icon: Wallet,
    registers: [
      { id: 'monat', label: 'Monat', to: '/plan/monat' },
      { id: 'jahr', label: 'Jahr', to: '/plan/jahr' },
      { id: 'erwartet', label: 'Erwartet', to: '/plan/erwartet' },
      { id: 'sparziele', label: 'Sparziele', to: '/plan/sparziele' },
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
      { id: 'buchungen', label: 'Alle Buchungen', to: '/konten/buchungen' },
      { id: 'posteingang', label: 'Posteingang', to: '/konten/posteingang' },
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
      { id: 'freiheit', label: 'Freiheitszahl', to: '/vermoegen/freiheit' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    no: '05',
    to: '/reports',
    icon: BarChart3,
    registers: [
      { id: 'katalog', label: 'Katalog', to: '/reports' },
      { id: 'monat', label: 'Monat und Einkommen', to: '/reports/gruppe/monat' },
      { id: 'ausgaben', label: 'Ausgaben und Plan', to: '/reports/gruppe/ausgaben' },
      { id: 'zukunft', label: 'Zukunft und Vermögen', to: '/reports/gruppe/zukunft' },
      { id: 'portfolio', label: 'Portfolio', to: '/reports/gruppe/portfolio' },
      { id: 'ueberblick', label: 'Überblick', to: '/reports/gruppe/ueberblick' },
    ],
  },
  {
    id: 'einstellungen',
    label: 'Einstellungen',
    to: '/einstellungen/konten',
    registers: [
      { id: 'konten', label: 'Konten', to: '/einstellungen/konten' },
      { id: 'kategorien', label: 'Kategorien', to: '/einstellungen/kategorien' },
      { id: 'regelwerk', label: 'Regelwerk', to: '/einstellungen/regelwerk' },
      { id: 'zuordnung', label: 'Zuordnungsregeln', to: '/einstellungen/zuordnung' },
      { id: 'datenquellen', label: 'Datenquellen', to: '/einstellungen/datenquellen' },
      { id: 'anlageklassen', label: 'Anlageklassen', to: '/einstellungen/anlageklassen' },
      { id: 'import', label: 'Import/Export', to: '/einstellungen/import' },
      { id: 'sicherheit', label: 'Sicherheit', to: '/einstellungen/sicherheit' },
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
