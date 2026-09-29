import type { SampleLedger } from './types';
import { CATS, PRODUCTS, PROJECTS, TICKET } from '../reference/model';
import { slug } from './util';

export const OPENING_DATE = '2023-10-01';

export const ACC = {
  giro: 'acc-giro',
  karte: 'acc-karte',
  tagesgeld: 'acc-tagesgeld',
  depot: 'acc-depot',
  krypto: 'acc-krypto',
  p2p: 'acc-p2p',
  kredit: 'acc-kredit',
} as const;

export const catId = (id: string) => `cat-${id}`;
export const payeeId = (name: string) => `pay-${slug(name)}`;
export const projectId = (id: string) => `prj-${id}`;
export const securityId = (id: string) => `sec-${id}`;

/** Payees that are paid by credit card; everything else runs over the current account. */
export const CARD_PAYEES = new Set([
  'Tankstelle',
  'Restaurant',
  'Café',
  'Lieferdienst',
  'Kino',
  'Freizeitpark',
  'Konzertkassa',
  'Online-Händler',
  'Elektronikmarkt',
  'Möbelhaus',
  'Reisebüro',
  'Streamingdienst',
  'KI-Anbieter A',
  'KI-Anbieter B',
  'Cloudanbieter',
]);

/** Waterfall stage of a category (SPEC §4: nine stages, stage 2 is "Laufender Monat"). */
function stageOf(c: (typeof CATS)[number]): number {
  if (c.id === 'investieren') return 8;
  if (c.id === 'notgroschen') return 5;
  if (c.id === 'sondertilgung') return 6;
  if (c.kind === 'periodic') return 4;
  if (c.kind === 'fix') return 1;
  return 2;
}

const PROJECT_PAYEE = {
  trading: 'Handelsplattform',
  kurse: 'Kursteilnehmer',
  orgel: 'Kirchengemeinde',
} as const;
export const projectPayee = (id: keyof typeof PROJECT_PAYEE) => PROJECT_PAYEE[id];

export function masterData(): Pick<
  SampleLedger,
  | 'institutions'
  | 'contacts'
  | 'accounts'
  | 'categoryGroups'
  | 'categories'
  | 'payees'
  | 'projects'
  | 'assetClasses'
  | 'securities'
> {
  const institutions: SampleLedger['institutions'] = [
    { id: 'inst-bank-a', name: 'Bank A', kind: 'bank' },
    { id: 'inst-bank-b', name: 'Bank B', kind: 'bank' },
    { id: 'inst-bank-f', name: 'Bank F', kind: 'bank' },
    { id: 'inst-broker-c', name: 'Broker C', kind: 'broker' },
    { id: 'inst-plattform-d', name: 'Plattform D', kind: 'platform' },
    { id: 'inst-plattform-e', name: 'Plattform E', kind: 'platform' },
  ];
  const contacts: SampleLedger['contacts'] = [
    { id: 'con-arbeitgeber', name: 'Arbeitgeber' },
    { id: 'con-muster', name: 'Kontakt M. Muster', note: 'Beiträge zum Haushalt' },
  ];
  const accounts: SampleLedger['accounts'] = [
    {
      id: ACC.giro,
      name: 'Girokonto',
      role: 'budget',
      institutionId: 'inst-bank-a',
      openingDate: OPENING_DATE,
      overdraftLimitCents: 300000,
      sortOrder: 1,
    },
    {
      id: ACC.karte,
      name: 'Kreditkarte',
      role: 'budget',
      institutionId: 'inst-bank-a',
      openingDate: OPENING_DATE,
      creditLimitCents: 300000,
      sortOrder: 2,
    },
    {
      id: ACC.tagesgeld,
      name: 'Tagesgeld',
      role: 'reserve',
      institutionId: 'inst-bank-b',
      openingDate: OPENING_DATE,
      interestRateBp: 250,
      sortOrder: 3,
    },
    {
      id: ACC.depot,
      name: 'Depot',
      role: 'investment',
      institutionId: 'inst-broker-c',
      openingDate: OPENING_DATE,
      sortOrder: 4,
    },
    {
      id: ACC.krypto,
      name: 'Krypto',
      role: 'investment',
      institutionId: 'inst-plattform-d',
      openingDate: OPENING_DATE,
      sortOrder: 5,
    },
    {
      id: ACC.p2p,
      name: 'P2P-Kredite',
      role: 'investment',
      institutionId: 'inst-plattform-e',
      openingDate: OPENING_DATE,
      sortOrder: 6,
    },
    {
      id: ACC.kredit,
      name: 'Kredit',
      role: 'debt',
      institutionId: 'inst-bank-f',
      openingDate: OPENING_DATE,
      interestRateBp: 632,
      termEnd: '2029-12-31',
      sortOrder: 7,
    },
  ];

  const groupNames = [...new Set(CATS.map((c) => c.group))];
  const categoryGroups: SampleLedger['categoryGroups'] = groupNames.map((name, i) => ({
    id: `grp-${slug(name)}`,
    name,
    sortOrder: i,
  }));
  const kindMap = {
    fix: 'fixed',
    var: 'variable',
    periodic: 'periodic',
    project: 'project',
  } as const;
  const categories: SampleLedger['categories'] = CATS.map((c, i) => ({
    id: catId(c.id),
    name: c.name,
    groupId: `grp-${slug(c.group)}`,
    class: c.cls,
    kind: c.cls === 'future' ? 'saving' : kindMap[c.kind],
    stage: stageOf(c),
    sortOrder: i,
  }));

  const names = new Set<string>(['Arbeitgeber', 'Kontakt M. Muster', 'Verwandtschaft', 'Bank B']);
  for (const p of PRODUCTS) names.add(p.plat);
  for (const c of CATS) {
    if (c.payee && c.payee !== 'diverse') names.add(c.payee);
    for (const [name] of c.payees ?? []) names.add(name);
  }
  for (const name of Object.values(PROJECT_PAYEE)) names.add(name);
  Object.keys(TICKET).forEach((n) => names.add(n));
  const contactOf: Record<string, string> = {
    Arbeitgeber: 'con-arbeitgeber',
    'Kontakt M. Muster': 'con-muster',
  };
  const defaultCategory: Record<string, string> = {};
  for (const c of CATS) {
    if (c.payee && c.payee !== 'diverse' && !c.transfer) defaultCategory[c.payee] ??= catId(c.id);
    for (const [name] of c.payees ?? []) defaultCategory[name] ??= catId(c.id);
  }
  const payees: SampleLedger['payees'] = [...names].map((name) => ({
    id: payeeId(name),
    name,
    ...(contactOf[name] ? { contactId: contactOf[name] } : {}),
    ...(defaultCategory[name] ? { defaultCategoryId: defaultCategory[name] } : {}),
  }));

  const projects: SampleLedger['projects'] = PROJECTS.map((p) => ({
    id: projectId(p.id),
    name: p.name,
    note: p.note,
  }));

  const assetClasses: SampleLedger['assetClasses'] = [
    { id: 'ac-welt', name: 'Aktien Welt', targetShareBp: 8000, sortOrder: 1 },
    { id: 'ac-em', name: 'Schwellenländer', targetShareBp: 1200, sortOrder: 2 },
    { id: 'ac-spec', name: 'Spekulativ', targetShareBp: 800, sortOrder: 3 },
  ];
  const classOf: Record<string, string> = {
    etfw: 'ac-welt',
    etfem: 'ac-em',
    akta: 'ac-spec',
    btc: 'ac-spec',
    eth: 'ac-spec',
    p2p: 'ac-spec',
  };
  const platform: Record<string, string> = {
    'Broker C': 'inst-broker-c',
    'Plattform D': 'inst-plattform-d',
    'Plattform E': 'inst-plattform-e',
  };
  const kindOf = { ETF: 'etf', Aktien: 'stock', Krypto: 'crypto', P2P: 'p2p' } as const;
  const securities: SampleLedger['securities'] = PRODUCTS.map((p) => ({
    id: securityId(p.id),
    name: p.name,
    kind: kindOf[p.cls],
    terBp: Math.round(p.ter * 10000),
    assetClassId: classOf[p.id] ?? null,
    institutionId: platform[p.plat] ?? null,
    regionsJson: JSON.stringify(p.regions),
    benchmark: p.bench,
  }));

  return {
    institutions,
    contacts,
    accounts,
    categoryGroups,
    categories,
    payees,
    projects,
    assetClasses,
    securities,
  };
}

/** Which investment account holds a product. */
export const ACCOUNT_OF_PRODUCT: Record<string, string> = {
  etfw: ACC.depot,
  etfem: ACC.depot,
  akta: ACC.depot,
  btc: ACC.krypto,
  eth: ACC.krypto,
  p2p: ACC.p2p,
};
