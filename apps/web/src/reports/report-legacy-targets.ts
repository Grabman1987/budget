/** The complete owner mapping (#487 / #620), including retained canonical addresses. */
export const LEGACY_REPORT_TARGETS: Readonly<Record<string, {
  to: string;
  defaults?: Readonly<Record<string, string>>;
  view?: Readonly<Record<string, string>>;
}>> = {
  einnahmen: { to: '/reports/einnahmen-ausgaben', view: { darstellung: 'income' } },
  'einnahmen-ausgaben': { to: '/reports/einnahmen-ausgaben' },
  cashflow: { to: '/reports/einnahmen-ausgaben', view: { darstellung: 'cashflow' } },
  projekte: { to: '/reports/einnahmen-ausgaben', view: { reportQuelle: 'projekte' } },
  ausgaben: { to: '/reports/ausgaben' },
  empfaenger: { to: '/reports/ausgaben', view: { darstellung: 'empfaenger' } },
  gehalt: { to: '/reports/gehalt' },
  geldfluss: { to: '/reports/geldfluss' },
  sparquote: { to: '/reports/sparquote' },
  budgettreue: { to: '/reports/budgettreue' },
  planungstreue: { to: '/reports/budgettreue', view: { reportQuelle: 'planungstreue' } },
  abos: { to: '/reports/abos' },
  kosten: { to: '/reports/abos', view: { reportQuelle: 'kosten' } },
  inflation: { to: '/reports/inflation' },
  vermoegen: { to: '/reports/vermoegen-schulden', view: { darstellung: 'verlauf' } },
  'vermoegen-schulden': { to: '/reports/vermoegen-schulden' },
  gesamtuebersicht: { to: '/reports/vermoegen-schulden', view: { darstellung: 'gesamt' }, defaults: { zeitraum: '1J' } },
  pdepots: { to: '/reports/pdepots' },
  pallocation: { to: '/reports/pallocation' },
  peinzahlungen: { to: '/reports/pallocation', view: { reportQuelle: 'peinzahlungen' } },
  prendite: { to: '/reports/pallocation', view: { reportQuelle: 'prendite' } },
  psteuern: { to: '/reports/psteuern' },
  explorer: { to: '/reports/explorer' },
  kategorien: { to: '/reports/explorer', view: { reportQuelle: 'kategorien' } },
  jahresansicht: { to: '/reports/explorer', view: { reportQuelle: 'jahresansicht' } },
  gesamttabelle: { to: '/reports/explorer', view: { reportQuelle: 'gesamttabelle' } },
  vergleich: { to: '/reports/vergleich' },
  onepager: { to: '/reports/onepager' },
  jahresreport: { to: '/reports/jahresreport' },
  liquiditaet: { to: '/plan/prognose' },
  vorschau: { to: '/plan/erwartet' },
  sparziele: { to: '/plan/sparziele' },
  kontakte: { to: '/konten/kontakte' },
  finanzcheck: { to: '/' },
};

/** Keep raw query values (including repeated/structured filters) through the router boundary.
 * Legacy view markers select the original body until its own consolidation is implemented.
 */
export function legacyReportHref(id: string, searchStr: string, hash = ''): string | undefined {
  const target = Object.hasOwn(LEGACY_REPORT_TARGETS, id) ? LEGACY_REPORT_TARGETS[id] : undefined;
  if (!target || target.to === `/reports/${id}`) return undefined;
  const search = new URLSearchParams(searchStr);
  for (const [key, value] of Object.entries(target.defaults ?? {})) {
    if (!search.has(key)) search.set(key, value);
  }
  for (const [key, value] of Object.entries(target.view ?? {})) search.set(key, value);
  const query = search.toString();
  return `${target.to}${query ? `?${query}` : ''}${hash ? `#${hash.replace(/^#/, '')}` : ''}`;
}
