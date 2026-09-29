/**
 * Reference model: a deterministic TypeScript port of the sample-ledger generator in
 * `design/prototype/reports-core.js` (synthetic data, October 2023 to 17 September 2026).
 *
 * It works in euros with floats exactly like the prototype so that every figure can be compared
 * one to one (`prototype-parity.test.ts` runs the prototype and diffs the arrays). The ledger
 * builder turns it into integer-cent bookings; nothing outside `packages/fixtures` should use
 * the euro floats of this file.
 *
 * Keep the order of the random draws (`rnd`) identical to the prototype: SPEND first, then INCOME.
 */

export type CategoryClass = 'need' | 'want' | 'future';
type Kind = 'fix' | 'var' | 'project' | 'periodic';

export interface RefMonth {
  k: number;
  y: number;
  /** Zero-based month (0 = Jan). */
  m: number;
  key: string;
  label: string;
  long: string;
  partial: boolean;
}

export interface RefCategory {
  id: string;
  name: string;
  cls: CategoryClass;
  group: string;
  kind: Kind;
  price?: Array<[string, number]>;
  usd?: Array<[string, number]>;
  payee?: string;
  due?: number;
  transfer?: boolean;
  base?: number;
  trend?: number;
  amp?: number;
  season?: Record<number, number>;
  payees?: Array<[string, number]>;
  /** Periodic events: [month0, amount, onlyYear?]. */
  events?: Array<[number, number, number?]>;
}

export interface RefProduct {
  id: string;
  name: string;
  cls: 'ETF' | 'Aktien' | 'Krypto' | 'P2P';
  depot: string;
  plat: string;
  now: number;
  share: number;
  beta: number;
  alpha: number;
  vol: number;
  ter: number;
  regions: Record<string, number>;
  bench: string | null;
}

export interface RefProductSeries {
  /** Value at month end, index 0..35. */
  v: number[];
  mkt: number[];
  contrib: number[];
  r: number[];
  start: number;
}

interface ProjectMonth {
  inc: number;
  cost: number;
}
export type RefProjectRow = { trading: ProjectMonth; kurse: ProjectMonth; orgel: ProjectMonth };

export const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTHS_LONG = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export const LAST_FULL = 34; // August 2026
export const INCOME_TYPES = [
  'Gehalt',
  'Sonderzahlung',
  'Beiträge von Kontakten',
  'Nebeneinkünfte',
  'Kapitalerträge',
  'Erstattungen',
  'Geschenke',
] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export const r2 = (v: number): number => Math.round(v * 100) / 100;

const C = (
  id: string,
  name: string,
  cls: CategoryClass,
  group: string,
  kind: Kind,
  extra: Partial<RefCategory>,
): RefCategory => ({ id, name, cls, group, kind, ...extra });

export const CATS: RefCategory[] = [
  C('miete', 'Miete', 'need', 'Wohnen', 'fix', { price: [['2023-10', 850], ['2025-01', 890]], payee: 'Hausverwaltung', due: 1 }),
  C('strom', 'Strom', 'need', 'Wohnen', 'fix', { price: [['2023-10', 88], ['2025-01', 95], ['2026-01', 105]], payee: 'Energieversorger', due: 25 }),
  C('internet', 'Internet', 'need', 'Wohnen', 'fix', { price: [['2023-10', 55], ['2025-07', 60]], payee: 'Internetanbieter', due: 15 }),
  C('bankspesen', 'Kontoführung', 'need', 'Bank und Gebühren', 'fix', { price: [['2023-10', 6.5], ['2025-04', 6.9]], payee: 'Bank A', due: 30 }),
  C('kreditrate', 'Kreditrate', 'need', 'Kredite', 'fix', { price: [['2023-10', 412]], payee: 'Bank F', due: 3 }),
  C('kfzvers', 'Kfz-Versicherung', 'need', 'Versicherungen', 'fix', { price: [['2023-10', 44], ['2025-01', 46], ['2026-01', 48]], payee: 'Versicherung G', due: 10 }),
  C('unfallvers', 'Unfallversicherung', 'need', 'Versicherungen', 'fix', { price: [['2023-10', 26], ['2025-01', 28]], payee: 'Versicherung G', due: 10 }),
  C('mobilfunk', 'Mobilfunk', 'need', 'Abos', 'fix', { price: [['2023-10', 25]], payee: 'Mobilfunkanbieter', due: 22 }),
  C('streaming', 'Streaming', 'want', 'Abos', 'fix', { price: [['2023-10', 15.99], ['2025-03', 17.99]], payee: 'Streamingdienst', due: 20 }),
  C('fitness', 'Fitnessstudio', 'want', 'Freizeit', 'fix', { price: [['2023-10', 39], ['2026-02', 42]], payee: 'Fitnessstudio', due: 1 }),
  C('cloud', 'Cloud-Speicher', 'want', 'Abos', 'fix', { price: [['2023-10', 2.99]], payee: 'Cloudanbieter', due: 12 }),
  C('zeitung', 'Zeitung digital', 'want', 'Abos', 'fix', { price: [['2025-05', 12.9]], payee: 'Verlag', due: 5 }),
  C('ki1', 'KI-Assistent', 'want', 'Abos', 'fix', { usd: [['2024-06', 20]], payee: 'KI-Anbieter A', due: 8 }),
  C('ki2', 'KI-Bildtool', 'want', 'Abos', 'fix', { usd: [['2025-09', 10]], payee: 'KI-Anbieter B', due: 14 }),
  C('projektkosten', 'Projektkosten', 'need', 'Projekte', 'project', { payee: 'diverse' }),
  C('lebensmittel', 'Lebensmittel', 'need', 'Lebensmittel', 'var', { base: 640, trend: 0.08, amp: 0.1, payees: [['Supermarkt', 0.62], ['Diskonter', 0.24], ['Bäckerei', 0.08], ['Markt', 0.06]] }),
  C('treibstoff', 'Treibstoff', 'need', 'Mobilität', 'var', { base: 142, trend: -0.03, amp: 0.15, payees: [['Tankstelle', 1]] }),
  C('oeffis', 'Öffis', 'need', 'Mobilität', 'var', { base: 55, trend: 0.03, amp: 0.2, payees: [['Verkehrsbetrieb', 1]] }),
  C('haushalt', 'Haushalt', 'need', 'Wohnen', 'var', { base: 140, trend: 0.04, amp: 0.3, payees: [['Drogerie', 0.6], ['Online-Händler', 0.4]] }),
  C('gesundheit', 'Gesundheit', 'need', 'Gesundheit', 'var', { base: 58, trend: 0.03, amp: 0.5, payees: [['Apotheke', 0.7], ['Ärztin', 0.3]] }),
  C('kleidung', 'Kleidung', 'need', 'Kleidung', 'var', { base: 58, trend: 0.02, amp: 0.4, season: { 2: 1.8, 9: 1.7, 11: 1.4, 6: 0.5 }, payees: [['Bekleidungsgeschäft', 0.7], ['Online-Händler', 0.3]] }),
  C('lieferdienste', 'Lieferdienste', 'want', 'Genuss', 'var', { base: 100, trend: 0.06, amp: 0.3, season: { 0: 1.3, 1: 1.2, 10: 1.2, 11: 1.3, 6: 0.7 }, payees: [['Lieferdienst', 1]] }),
  C('freizeit', 'Freizeit', 'want', 'Freizeit', 'var', { base: 210, trend: 0.04, amp: 0.3, season: { 5: 1.3, 6: 1.5, 7: 1.4, 0: 0.7 }, payees: [['Kino', 0.35], ['Freizeitpark', 0.25], ['Konzertkassa', 0.4]] }),
  C('essen', 'Essen gehen', 'want', 'Genuss', 'var', { base: 260, trend: 0.05, amp: 0.25, season: { 11: 1.4, 6: 1.2 }, payees: [['Restaurant', 0.75], ['Café', 0.25]] }),
  C('anschaffungen', 'Anschaffungen', 'want', 'Anschaffungen', 'var', { base: 240, trend: 0.03, amp: 0.8, season: { 10: 1.6, 11: 1.3 }, payees: [['Elektronikmarkt', 0.45], ['Möbelhaus', 0.2], ['Online-Händler', 0.35]] }),
  C('pflege', 'Friseur und Pflege', 'want', 'Pflege', 'var', { base: 70, trend: 0.04, amp: 0.4, payees: [['Friseur', 0.6], ['Parfümerie', 0.4]] }),
  C('hobby', 'Hobby', 'want', 'Freizeit', 'var', { base: 90, trend: 0.02, amp: 0.6, payees: [['Buchhandlung', 0.5], ['Online-Händler', 0.5]] }),
  C('hhvers', 'Haushaltsversicherung', 'need', 'Versicherungen', 'periodic', { events: [[0, 452], [0, 486, 2026]], payee: 'Versicherung G' }),
  C('kfzservice', 'Kfz-Service', 'need', 'Mobilität', 'periodic', { events: [[2, 540], [2, 580, 2026]], payee: 'Werkstatt' }),
  C('weihnachten', 'Weihnachten', 'want', 'Geschenke', 'periodic', { events: [[11, 800]], payee: 'Online-Händler' }),
  C('reisen', 'Reisen', 'want', 'Reisen', 'periodic', { events: [[7, 3000], [1, 1400], [4, 600]], payee: 'Reisebüro' }),
  C('geschenke', 'Geschenke', 'want', 'Geschenke', 'periodic', { events: [[3, 90], [6, 120], [9, 100]], payee: 'Online-Händler' }),
  C('investieren', 'Investieren (ETF-Sparplan)', 'future', 'Investieren', 'fix', { price: [['2023-10', 300], ['2024-01', 400]], payee: 'Depot · ETF', due: 5, transfer: true }),
  C('notgroschen', 'Notgroschen', 'future', 'Notgroschen', 'fix', { price: [['2023-10', 250], ['2025-01', 300]], payee: 'Tagesgeld', due: 16, transfer: true }),
  C('sondertilgung', 'Sondertilgung', 'future', 'Kredite', 'fix', { price: [['2026-06', 300]], payee: 'Bank F', due: 3, transfer: true }),
];

export const PROJECTS = [
  { id: 'trading', name: 'Trading', note: 'realisierte Gewinne; Verluste und Datenabo als Kosten' },
  { id: 'kurse', name: 'Kurse und Coaching', note: 'Kursverkäufe und Sitzungen; Plattform als Kosten' },
  { id: 'orgel', name: 'Orgel', note: 'Orgeldienste; Noten als Kosten' },
] as const;

export const SALARY = [
  { from: '2023-10', gross: 5280, net: 3590 },
  { from: '2024-04', gross: 5440, net: 3690 },
  { from: '2025-04', gross: 5530, net: 3745 },
  { from: '2026-04', gross: 5650, net: 3812 },
] as const;

export const LOAN = { rate: 0.0632, pmt: 412, now: 12176 } as const;

export const TICKET: Record<string, number> = {
  Supermarkt: 42, Diskonter: 28, 'Bäckerei': 6.5, Markt: 18, Tankstelle: 58, Verkehrsbetrieb: 21, Drogerie: 19,
  'Online-Händler': 36, Apotheke: 14, 'Ärztin': 45, 'Bekleidungsgeschäft': 55, Elektronikmarkt: 89, Friseur: 38,
  'Parfümerie': 24, 'Möbelhaus': 140, Lieferdienst: 26, Kino: 26, Freizeitpark: 48, Konzertkassa: 65, Restaurant: 48,
  'Café': 9, Buchhandlung: 22,
};

export const PRODUCTS: RefProduct[] = [
  { id: 'etfw', name: 'ETF Welt', cls: 'ETF', depot: 'Aktien und ETF', plat: 'Broker C', now: 68500, share: 0.792, beta: 1.0, alpha: 0, vol: 0.004, ter: 0.002, regions: { Nordamerika: 0.7, Europa: 0.15, 'Asien-Pazifik': 0.11, Schwellenländer: 0.04 }, bench: 'Weltindex' },
  { id: 'etfem', name: 'ETF Schwellenländer', cls: 'ETF', depot: 'Aktien und ETF', plat: 'Broker C', now: 7000, share: 0.15, beta: 0.8, alpha: -0.002, vol: 0.013, ter: 0.0018, regions: { Schwellenländer: 1 }, bench: 'Schwellenländerindex' },
  { id: 'akta', name: 'Einzelaktie A', cls: 'Aktien', depot: 'Aktien und ETF', plat: 'Broker C', now: 3950, share: 0.05, beta: 1.2, alpha: 0.002, vol: 0.035, ter: 0, regions: { Europa: 1 }, bench: 'Europaindex' },
  { id: 'btc', name: 'Bitcoin', cls: 'Krypto', depot: 'Krypto', plat: 'Plattform D', now: 3400, share: 0.005, beta: 1.0, alpha: 0.026, vol: 0.13, ter: 0, regions: { Global: 1 }, bench: 'Weltindex' },
  { id: 'eth', name: 'Ethereum', cls: 'Krypto', depot: 'Krypto', plat: 'Plattform D', now: 935, share: 0.003, beta: 2.0, alpha: -0.004, vol: 0.14, ter: 0, regions: { Global: 1 }, bench: 'Weltindex' },
  { id: 'p2p', name: 'P2P-Kredite', cls: 'P2P', depot: 'P2P', plat: 'Plattform E', now: 4215, share: 0, beta: 0, alpha: 0.0052, vol: 0.002, ter: 0, regions: { Europa: 1 }, bench: null },
];

/** Balances today (17.09.2026), anchor of the net-worth series. */
export const NOW = { depot: 79450, krypto: 4335, p2p: 4215, tagesgeld: 7739, giro: 1617, kredit: -12176, karte: -450 } as const;
export const NET_WORTH_NOW = 84730;

export interface ReferenceModel {
  months: RefMonth[];
  fx: number[];
  spend: Array<Record<string, number>>;
  income: Array<Record<IncomeType, number>>;
  proj: RefProjectRow[];
  plan: Array<Record<string, number>>;
  payroll: Array<{ k: number; label: string; gross: number; sv: number; lst: number; net: number; special: { gross: number; sv: number; lst: number; net: number } | null }>;
  loanh: Array<{ end: number; interest: number; principal: number }>;
  pv: Record<string, RefProductSeries>;
  /** Monthly portfolio return (opening-value weighted, product returns from the price paths). */
  ret: number[];
  m: number[];
  nw: number[];
  nwStart: number;
  own: number[];
  mkt: number[];
  inv: number[];
  invStart: number;
  salaryAt: (key: string) => { from: string; gross: number; net: number };
  priceAt: (c: RefCategory, key: string) => number;
  fxAt: (key: string) => number;
  usdAt: (c: RefCategory, key: string) => number;
  periodicYear: (c: RefCategory, y: number) => number;
  incomeOf: (k: number) => number;
  spendOf: (k: number, filter?: (c: RefCategory) => boolean) => number;
  consumptionOf: (k: number) => number;
  alloc: (ks: number[]) => { need: number; want: number; future: number; income: number; rest: number };
}

let cached: ReferenceModel | undefined;

/** Build (once) the reference model. Deterministic: same numbers on every run. */
export function referenceModel(): ReferenceModel {
  cached ??= build();
  return cached;
}

function build(): ReferenceModel {
  let seed = 20231001;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const noise = (amp: number) => 1 + (rnd() - 0.5) * 2 * amp;

  // ---------- Months: Oct 2023 … Sep 2026 (September runs to the 17th) ----------
  const months: RefMonth[] = [];
  for (let k = 0; k < 36; k++) {
    const m = (9 + k) % 12;
    const y = 2023 + Math.floor((9 + k) / 12);
    months.push({
      k,
      y,
      m,
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${MONTHS[m]} ${String(y).slice(2)}`,
      long: `${MONTHS_LONG[m]} ${y}`,
      partial: k === 35,
    });
  }
  const mo = (k: number): RefMonth => months[k] as RefMonth;
  const kOfKey = (key: string) => {
    const i = months.findIndex((x) => x.key === key);
    return i < 0 ? 35 : i;
  };
  const fx = months.map((x) => Math.round((0.935 - 0.0021 * x.k + 0.014 * Math.sin(x.k / 3.2)) * 10000) / 10000);
  const fxAt = (key: string) => fx[kOfKey(key)] as number;

  const usdAt = (c: RefCategory, key: string) => {
    let v = 0;
    for (const [from, amt] of c.usd ?? []) if (key >= from) v = amt;
    return v;
  };
  const priceAt = (c: RefCategory, key: string) => {
    if (c.usd) return Math.round(usdAt(c, key) * fxAt(key) * 100) / 100;
    let v = 0;
    for (const [from, amt] of c.price ?? []) if (key >= from) v = amt;
    return v;
  };

  // ---------- Side projects ----------
  const proj: RefProjectRow[] = months.map((x) => {
    const k = x.k;
    const part = x.partial ? 17 / 30 : 1;
    const swing = Math.sin(k * 1.9) * 220 + Math.cos(k * 0.7) * 90;
    const trading = { inc: Math.max(0, swing - 20) * 0.7 * part, cost: (Math.max(0, -(swing - 20)) * 0.7 + 29) * part };
    const kurse = x.key >= '2025-03' ? { inc: (k % 3 === 0 ? 360 : k % 3 === 1 ? 120 : 0) * part, cost: 39 * part } : { inc: 0, cost: 0 };
    const orgel = { inc: (x.m === 11 ? 5 : x.m === 3 ? 4 : 3) * 45 * part, cost: ((k % 4 === 1 ? 78 : 18) + (x.m === 10 ? 64 : 0)) * part };
    const row = { trading, kurse, orgel };
    for (const p of Object.values(row)) {
      p.inc = Math.round(p.inc * 100) / 100;
      p.cost = Math.round(p.cost * 100) / 100;
    }
    return row;
  });

  const salaryAt = (key: string) => {
    let s: (typeof SALARY)[number] = SALARY[0];
    for (const x of SALARY) if (key >= x.from) s = x;
    return s;
  };
  const salaryAtKey = (key: string) => ({ gross: key >= '2026-04' ? 5650 : key >= '2025-04' ? 5530 : key >= '2024-04' ? 5440 : 5280 });

  // ---------- Spend per month and category (positive = outflow) ----------
  const spend: Array<Record<string, number>> = months.map((x) => {
    const row: Record<string, number> = {};
    const frac = x.partial ? 17 / 30 : 1;
    for (const c of CATS) {
      let v = 0;
      if (c.kind === 'fix') {
        v = priceAt(c, x.key);
        if (x.partial && (c.due ?? 0) > 17) v = 0;
      } else if (c.kind === 'var') {
        const yrs = x.k / 12;
        v = (c.base as number) * Math.pow(1 + (c.trend as number), yrs) * (c.season?.[x.m] ?? 1) * noise(c.amp as number) * frac;
      } else if (c.kind === 'project') {
        v = (proj[x.k] as RefProjectRow).trading.cost + (proj[x.k] as RefProjectRow).kurse.cost + (proj[x.k] as RefProjectRow).orgel.cost;
      } else if (c.kind === 'periodic') {
        const events = c.events as Array<[number, number, number?]>;
        for (const [m, amt, onlyYear] of events) {
          if (m === x.m && (!onlyYear || onlyYear === x.y) && !(onlyYear === undefined && events.some((e) => e[0] === m && e[2] === x.y))) v += amt * noise(0.05);
        }
        if (x.partial) v = 0;
      }
      row[c.id] = r2(v);
    }
    // R12 Windfall: of a special payment, 50 % into the ETF and 20 % into the emergency fund
    const sz = x.m === 5 || x.m === 10 ? salaryAtKey(x.key).gross * 0.772 : 0;
    if (sz) {
      row['investieren'] = r2((row['investieren'] as number) + sz * 0.5);
      row['notgroschen'] = r2((row['notgroschen'] as number) + sz * 0.2);
    }
    // the known overspending of September: fuel
    if (x.partial) Object.assign(row, { treibstoff: 152.4, lebensmittel: 388, lieferdienste: 62, freizeit: 56, essen: 121, haushalt: 35.5, kleidung: 30, hobby: 0, gesundheit: 0, oeffis: 0 });
    return row;
  });

  // ---------- Income ----------
  const income: Array<Record<IncomeType, number>> = months.map((x) => {
    const s = salaryAt(x.key);
    const row: Record<IncomeType, number> = {
      Gehalt: x.partial ? 0 : s.net,
      Sonderzahlung: 0,
      'Beiträge von Kontakten': 0,
      Nebeneinkünfte: 0,
      Kapitalerträge: 0,
      Erstattungen: 0,
      Geschenke: 0,
    };
    const p = proj[x.k] as RefProjectRow;
    row.Nebeneinkünfte = r2(p.trading.inc + p.kurse.inc + p.orgel.inc);
    if (x.m === 5 || x.m === 10) row.Sonderzahlung = r2(s.gross * 0.772);
    if (!x.partial) row['Beiträge von Kontakten'] = x.key >= '2025-01' ? 800 : 750;
    if ([2, 5, 8, 11].includes(x.m)) row.Kapitalerträge = r2((150 + x.k * 6) * noise(0.2));
    row.Kapitalerträge = r2(row.Kapitalerträge + (x.key >= '2024-01' && x.key < '2026-01' ? 22 : 12) * noise(0.2));
    if (x.k % 5 === 2) row.Erstattungen = r2(60 + rnd() * 90);
    if (x.m === 11) row.Geschenke = 200;
    if (x.m === 6) row.Geschenke = 150;
    return row;
  });

  const payroll = months
    .filter((x) => !x.partial)
    .map((x) => {
      const s = salaryAt(x.key);
      const sv = r2(s.gross * 0.1812);
      const lst = r2(s.gross - sv - s.net);
      const special = x.m === 5 || x.m === 10 ? { gross: s.gross, sv: r2(s.gross * 0.1712), lst: r2(s.gross * 0.06 - 0.6), net: (income[x.k] as Record<IncomeType, number>).Sonderzahlung } : null;
      return { k: x.k, label: x.label, gross: s.gross, sv, lst, net: s.net, special };
    });

  // ---------- Totals ----------
  const sumObj = (o: object) => (Object.values(o) as number[]).reduce((a, b) => a + b, 0);
  const incomeOf = (k: number) => r2(sumObj(income[k] as object));
  const spendOf = (k: number, filter: (c: RefCategory) => boolean = () => true) =>
    r2(CATS.filter(filter).reduce((a, c) => a + ((spend[k] as Record<string, number>)[c.id] as number), 0));
  const consumptionOf = (k: number) => spendOf(k, (c) => c.cls !== 'future');

  // ---------- Plan per category and month ----------
  const plan: Array<Record<string, number>> = months.map((x) => {
    const row: Record<string, number> = {};
    for (const c of CATS) {
      if (c.kind === 'fix') row[c.id] = priceAt(c, x.key);
      else if (c.kind === 'project') row[c.id] = 110;
      else if (c.kind === 'var') row[c.id] = Math.round(((c.base as number) * Math.pow(1 + (c.trend as number), x.k / 12) * (c.season?.[x.m] ?? 1)) / 10) * 10;
      else {
        const events = c.events as Array<[number, number, number?]>;
        row[c.id] = events.filter((e) => e[0] === x.m && (!e[2] || e[2] === x.y) && !(e[2] === undefined && events.some((o) => o[0] === e[0] && o[2] === x.y))).reduce((a, e) => a + e[1], 0);
      }
    }
    return row;
  });
  (plan[35] as Record<string, number>)['lebensmittel'] = 540;
  (plan[35] as Record<string, number>)['treibstoff'] = 140;

  // ---------- Loan history (backwards from today's balance) ----------
  const loanh: Array<{ end: number; interest: number; principal: number }> = [];
  {
    const i = LOAN.rate / 12;
    let b: number = LOAN.now;
    for (let k = 35; k >= 0; k--) {
      const pay = LOAN.pmt + (k >= 32 ? 300 : 0);
      const prev = (b + pay) / (1 + i);
      loanh[k] = { end: r2(b), interest: r2(prev * i), principal: r2(pay - prev * i) };
      b = prev;
    }
  }

  // ---------- Portfolio ----------
  const M0 = months.map((x) => (x.partial ? 0.006 : Math.round((((x.k * 7919) % 97) / 97 * 0.058 - 0.0198) * 10000) / 10000));
  const noiseByProduct: Record<string, number[]> = {};
  const idio = (p: RefProduct, k: number) => {
    if (!noiseByProduct[p.id]) {
      let sd = [...p.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 233280;
      const u = () => {
        sd = (sd * 9301 + 49297) % 233280;
        return sd / 233280;
      };
      const xs = Array.from({ length: 36 }, () => (u() + u() + u() - 1.5) * 2);
      const mean = xs.reduce((a, b) => a + b, 0) / 36;
      noiseByProduct[p.id] = xs.map((v) => v - mean);
    }
    return ((noiseByProduct[p.id] as number[])[k] as number) * p.vol;
  };
  let ret: number[] = [];
  let m: number[] = M0.slice();
  const pv: Record<string, RefProductSeries> = {};
  function simulate(shiftA: number, shiftB: number) {
    m = M0.map((x, k) => x + (k >= 24 ? shiftA : shiftB));
    for (const p of PRODUCTS) pv[p.id] = { v: [], mkt: [], contrib: [], r: [], start: 0 };
    for (const p of PRODUCTS) {
      const series = pv[p.id] as RefProductSeries;
      let v = p.now;
      for (let k = 35; k >= 0; k--) {
        const r = p.cls === 'P2P' ? p.alpha - (k % 11 === 4 ? 0.006 : 0) : p.alpha + p.beta * (m[k] as number) + idio(p, k);
        const c = (spend[k] as Record<string, number>)['investieren']! * p.share;
        const prev = (v - c) / (1 + r);
        series.v[k] = v;
        series.mkt[k] = prev * r;
        series.contrib[k] = c;
        series.r[k] = r;
        v = prev;
      }
      series.start = v;
    }
    ret = months.map((_, k) => {
      let a = 0;
      let b2 = 0;
      for (const p of PRODUCTS) {
        const s = pv[p.id] as RefProductSeries;
        const prev = k ? (s.v[k - 1] as number) : s.start;
        a += prev * (s.r[k] as number);
        b2 += prev;
      }
      return a / b2;
    });
  }
  const twr = (from: number, to: number) => {
    let p = 1;
    for (let k = from; k <= to; k++) p *= 1 + (ret[k] as number);
    return p;
  };
  // calibrate to the portfolio figures on Vermögen: 12 months +12,4 %, since Okt 2023 +38,2 % (TTWROR)
  {
    let lo = -0.03;
    let hi = 0.03;
    let sA = 0;
    for (let it = 0; it < 50; it++) {
      sA = (lo + hi) / 2;
      simulate(sA, 0);
      if (twr(24, 35) > 1.124) hi = sA;
      else lo = sA;
    }
    const target = 1.382 / twr(24, 35);
    lo = -0.03;
    hi = 0.03;
    let sB = 0;
    for (let it = 0; it < 50; it++) {
      sB = (lo + hi) / 2;
      simulate(sA, sB);
      if (twr(0, 23) > target) hi = sB;
      else lo = sB;
    }
  }

  // ---------- Net worth from the ledger (anchored today, computed backwards) ----------
  const nw: number[] = [];
  const inv: number[] = [];
  const own: number[] = [];
  const mkt: number[] = [];
  let nwNow = NET_WORTH_NOW as number;
  for (let k = 35; k >= 0; k--) {
    nw[k] = r2(nwNow);
    inv[k] = r2(PRODUCTS.reduce((a, p) => a + ((pv[p.id] as RefProductSeries).v[k] as number), 0));
    const o = incomeOf(k) - consumptionOf(k) + (LOAN.pmt - (loanh[k] as { interest: number }).interest);
    const mk = PRODUCTS.reduce((a, p) => a + ((pv[p.id] as RefProductSeries).mkt[k] as number), 0);
    own[k] = r2(o);
    mkt[k] = r2(mk);
    nwNow -= o + mk;
  }
  const nwStart = r2(nwNow);
  const invStart = r2(PRODUCTS.reduce((a, p) => a + (pv[p.id] as RefProductSeries).start, 0));

  // ---------- 50/30/20 on assigned money ----------
  const periodicYear = (c: RefCategory, y: number) => {
    const events = c.events as Array<[number, number, number?]>;
    return events
      .filter((e) => !e[2] || e[2] === y)
      .filter((e, _i, arr) => !(e[2] === undefined && arr.some((x) => x[0] === e[0] && x[2] === y)))
      .reduce((a, e) => a + e[1], 0);
  };
  function alloc(ks: number[]) {
    const out = { need: 0, want: 0, future: 0, income: 0, rest: 0 };
    for (const k of ks) {
      const x = mo(k);
      out.income += incomeOf(k) - (income[k] as Record<IncomeType, number>).Sonderzahlung + (salaryAtKey(x.key).gross * 0.772 * 2) / 12;
      for (const c of CATS) {
        const v =
          c.kind === 'periodic'
            ? periodicYear(c, x.y) / 12
            : c.id === 'investieren' || c.id === 'notgroschen'
              ? priceAt(c, x.key) + (salaryAtKey(x.key).gross * 0.772 * 2 * (c.id === 'investieren' ? 0.5 : 0.2)) / 12
              : ((spend[k] as Record<string, number>)[c.id] as number);
        out[c.cls] += v;
      }
    }
    out.rest = out.income - out.need - out.want - out.future;
    return out;
  }

  return {
    months, fx, spend, income, proj, plan, payroll, loanh, pv, ret, m, nw, nwStart, own, mkt, inv, invStart,
    salaryAt, priceAt, fxAt, usdAt, periodicYear, incomeOf, spendOf, consumptionOf, alloc,
  };
}
