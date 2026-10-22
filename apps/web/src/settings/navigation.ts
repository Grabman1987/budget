import type { PageDef, PageMeta } from '../nav/pages';

/** Owner decision 8A / page review 2026-10-16. Navigation never writes a setting. */
export const SETTINGS_SECTIONS = [
  { id: 'darstellung', label: 'Darstellung', to: '/einstellungen/darstellung', description: 'Farbschema, Beträge verbergen, Kontovorschau und Erinnerungen' },
  { id: 'regeln-automatik', label: 'Regeln und Automatik', to: '/einstellungen/regeln-automatik', description: 'Schwellen, Aktivierung und Zuordnungsregeln' },
  { id: 'verbindungen', label: 'Verbindungen', to: '/einstellungen/verbindungen', description: 'Bank, Krypto und Gehaltszettel' },
  { id: 'daten-export', label: 'Daten und Export', to: '/einstellungen/daten-export', description: 'Daten herunterladen' },
  { id: 'sicherheit', label: 'Sicherheit', to: '/einstellungen/sicherheit', description: 'Passkeys, Wiederherstellungscodes, Sitzungen und Gerät' },
  { id: 'erweitert', label: 'Erweitert', to: '/einstellungen/erweitert', description: 'Profil und Projekte' },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];
export function settingsSectionMeta(id: SettingsSection): PageDef {
  const section = SETTINGS_SECTIONS.find((entry) => entry.id === id)!;
  return { path: section.to, title: `Einstellungen · ${section.label}`, area: 'einstellungen', register: id,
    fills: 'P4 Datenquellen', spec: section.description };
}
export const SETTINGS_DESTINATIONS = {
  accounts: '/konten/verwalten',
  investment: '/konten/portfolio-einstellungen',
  categories: '/plan/kategorien',
  allocation: '/vermoegen/portfolio/allokation/bearbeiten',
  basket: '/reports/inflation/warenkorb',
  rules: '/einstellungen/regeln-automatik/regeln',
  assignment: '/einstellungen/regeln-automatik/zuordnung',
  projects: '/einstellungen/erweitert/projekte',
  profile: '/einstellungen/erweitert/profil',
  check: '/heute/finanzcheck',
} as const;
const page = (path: string, title: string, area: PageMeta['area'], register: string): PageDef => ({
  path, title, area, register, fills: 'P4 Datenquellen', spec: 'Bestehende Verwaltung am Nutzungsort; unveränderte Schreibwege.',
});
export const RELOCATED_PAGES = {
  accounts: page(SETTINGS_DESTINATIONS.accounts, 'Konten verwalten', 'konten', 'uebersicht'),
  investment: page(SETTINGS_DESTINATIONS.investment, 'Portfolio-Auswertung', 'konten', 'uebersicht'),
  categories: page(SETTINGS_DESTINATIONS.categories, 'Kategorien verwalten', 'plan', 'kategorien'),
  allocation: page(SETTINGS_DESTINATIONS.allocation, 'Anlageklassen und Sollmodell', 'vermoegen', 'portfolio'),
  basket: page(SETTINGS_DESTINATIONS.basket, 'Warenkorb bearbeiten', 'reports', 'ausgaben'),
  rules: page(SETTINGS_DESTINATIONS.rules, 'Einstellungen · Regeln und Automatik', 'einstellungen', 'regeln-automatik'),
  assignment: page(SETTINGS_DESTINATIONS.assignment, 'Einstellungen · Regeln und Automatik', 'einstellungen', 'regeln-automatik'),
  projects: page(SETTINGS_DESTINATIONS.projects, 'Einstellungen · Erweitert', 'einstellungen', 'erweitert'),
  profile: page(SETTINGS_DESTINATIONS.profile, 'Einstellungen · Erweitert', 'einstellungen', 'erweitert'),
  check: page(SETTINGS_DESTINATIONS.check, 'Finanz-Check', 'heute', 'finanzcheck'),
} as const;

/** All twelve previous settings addresses remain addressable, including their query and hash. */
export const LEGACY_SETTINGS_TARGETS: Readonly<Record<string, string>> = {
  '/einstellungen/konten': SETTINGS_DESTINATIONS.accounts,
  '/einstellungen/depots': SETTINGS_DESTINATIONS.investment,
  '/einstellungen/kategorien': SETTINGS_DESTINATIONS.categories,
  '/einstellungen/anlageklassen': SETTINGS_DESTINATIONS.allocation,
  '/einstellungen/warenkorb': SETTINGS_DESTINATIONS.basket,
  '/einstellungen/regelwerk': SETTINGS_DESTINATIONS.rules,
  '/einstellungen/zuordnung': SETTINGS_DESTINATIONS.assignment,
  '/einstellungen/datenquellen': '/einstellungen/verbindungen',
  '/einstellungen/export': '/einstellungen/daten-export',
  '/einstellungen/sicherheit': '/einstellungen/sicherheit',
  '/einstellungen/projekte': SETTINGS_DESTINATIONS.projects,
  '/einstellungen/profil': SETTINGS_DESTINATIONS.profile,
};

export function relocatedSettingsHref(pathname: string, searchStr: string, hash = ''): string | undefined {
  let target = Object.hasOwn(LEGACY_SETTINGS_TARGETS, pathname) ? LEGACY_SETTINGS_TARGETS[pathname] : undefined;
  const fragment = hash.replace(/^#/, '');
  if (pathname === '/einstellungen/profil' && ['display-title', 'preview-title', 'reminder-title'].includes(fragment))
    target = '/einstellungen/darstellung';
  if (pathname === '/einstellungen/regelwerk' && (fragment === 'rw-pending' || fragment === 'stg-title' || fragment.startsWith('rule-result-')))
    target = SETTINGS_DESTINATIONS.check;
  if (pathname.startsWith('/einstellungen/kategorien/'))
    target = SETTINGS_DESTINATIONS.categories + pathname.slice('/einstellungen/kategorien'.length);
  if (pathname.startsWith('/einstellungen/regelwerk/')) {
    const editing = new URLSearchParams(searchStr).get('bearbeiten') === 'true';
    target = (editing ? SETTINGS_DESTINATIONS.rules : SETTINGS_DESTINATIONS.check) + pathname.slice('/einstellungen/regelwerk'.length);
  }
  if (!target || target === pathname) return undefined;
  return `${target}${searchStr}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;
}

/** The palette can find each editor directly without adding it to the six-section rail. */
export const SETTINGS_SEARCH_PAGES = [
  ...Object.values(RELOCATED_PAGES).map((entry) => ({ to: entry.path, label: entry.title })),
  { to: SETTINGS_DESTINATIONS.investment, label: 'Konten · Einstandskosten und Benchmarks' },
  { to: SETTINGS_DESTINATIONS.projects, label: 'Erweitert · Projekte' },
  { to: SETTINGS_DESTINATIONS.profile, label: 'Erweitert · Profil' },
];
