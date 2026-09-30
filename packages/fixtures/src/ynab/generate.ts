import {
  addMonths,
  budgetMonths,
  lastDayOfMonth,
  monthsBetween,
  type LedgerSplit,
} from '@budget/domain';
import { seeded } from '../ledger/util';

/**
 * Synthetic YNAB export ("Export plan data") in exactly the format of `docs/migration/ynab-export.md`:
 * UTF-8 with BOM, CRLF, text fields quoted and amount fields bare (as YNAB writes them), emoji CESU-8 encoded in some rows, `€`-amounts with
 * decimal comma, `DD.MM.YYYY` dates and `Mon YYYY` plan months. All names are made up.
 *
 * The Plan.tsv figures are YNAB's rule as implemented by `budgetMonths` (`cardRule: 'ynab'`); the
 * card cases of the migration doc are fixed events in May–August 2024 with hand-checked figures
 * (see `ynab-export.test.ts`).
 */

export const YNAB_AS_OF = '2026-09-29';
export const YNAB_FILE_NAMES = {
  register: 'Musterhaushalt as of 2026-09-29 18-30 - Register.tsv',
  plan: 'Musterhaushalt as of 2026-09-29 18-30 - Plan.tsv',
} as const;
const FIRST_MONTH = '2022-01';
/** YNAB's plan runs one month ahead when that month has assignments. */
const LAST_MONTH = '2026-10';

const GIRO = 'Girokonto';
const BLUE = 'Kreditkarte Blau';
const GREEN = 'Kreditkarte Grün';
/** A budget account paid from the card (cash advance); exported with a trailing space. */
const WALLET = 'Online-Wallet';
/** name, on budget, opening date, opening balance (cents). */
const ACCOUNTS: [string, boolean, string, number][] = [
  [GIRO, true, '2022-01-01', 250000],
  ['Haushaltskonto', true, '2022-01-01', 40000],
  ['Bargeld', true, '2022-01-01', 8000],
  ['Tagesgeld', true, '2022-01-01', 500000],
  [BLUE, true, '2022-01-01', 0],
  [GREEN, true, '2024-04-01', 0],
  ['Altes Sparbuch', true, '2022-01-01', 120000], // closed 2023-03 (before the start month)
  ['Altes Girokonto', true, '2022-01-01', 30000], // closed 2025-06 (after the start month)
  ['Depot', false, '2022-01-01', 1500000],
  ['Krypto', false, '2024-02-01', 0],
  ['Wohnkredit', false, '2022-01-01', -18000000],
  ['Forderung Kontakt A', false, '2023-05-01', 0],
  [WALLET, true, '2022-01-01', 0],
  ['Autokredit', false, '2022-01-01', -500000], // paid off in 2023-08
];
const onBudget = new Map(ACCOUNTS.map(([name, on]) => [name, on]));

type Spec =
  | {
      fixed: number;
      day: number;
      payee: string;
      account?: string;
      months?: number[];
      from?: string;
    }
  | { variable: number; n: number; payee: string; from?: string }
  | { transfer: number; day: number; to: string; from?: string; until?: string }
  | { save: number }
  | null;
const FIX = '🏠 Fixkosten';
const DAILY = '🛒 Täglich';
const FUN = '🎉 Freizeit '; // trailing space as observed
const PERIODIC = '🔧 Periodisch';
const FUTURE = '📈 Zukunft';
const CHILD = '👶 Kind';
const SIDE = '💼 Nebenprojekt';
const CARDS = 'Credit Card Payments';
const HIDDEN = 'Hidden Categories';
const CATEGORIES: [string, string, Spec][] = [
  // Bracketed notes in every form the real export uses (docs/migration/ynab-export.md).
  [FIX, 'Miete - [€ 1.089,61 am 01.]', { fixed: 108961, day: 1, payee: 'Vermieter' }],
  [FIX, 'Strom - [€ 85 am 05.]', { fixed: 8500, day: 5, payee: 'Energieversorger' }],
  [FIX, 'Internet - [€ ??,- am 10.]', { fixed: 3990, day: 10, payee: 'Internetanbieter' }],
  [
    FIX,
    'Handy - [€ 15,30 am 30./31.]',
    { fixed: 1530, day: 31, payee: 'Mobilfunk', account: BLUE },
  ],
  [FIX, 'Streaming - [9,99 am ?]', { fixed: 999, day: 3, payee: 'Streamingdienst', account: BLUE }],
  [
    FIX,
    'Rundfunk - [€ 60,- am 01.02. & 01.08.]',
    { fixed: 6000, day: 1, months: [2, 8], payee: 'Rundfunkbeitrag' },
  ],
  [FIX, 'Kreditrate - [€ 600- am 01.]', { transfer: 60000, day: 1, to: 'Wohnkredit' }],
  [FIX, 'Autokredit', { transfer: 25000, day: 15, to: 'Autokredit', until: '2023-09' }],
  [
    FIX,
    'Versicherung Haushalt - [€ 180,- am 01.03.]',
    { fixed: 18000, day: 1, months: [3], payee: 'Versicherung' },
  ],
  [
    FIX,
    'Kfz-Versicherung - [€ 1.080 - am 01.11.]',
    { fixed: 108000, day: 1, months: [11], payee: 'Versicherung' },
  ],
  [DAILY, '🛒 Lebensmittel', { variable: 52000, n: 8, payee: 'Supermarkt' }],
  [DAILY, 'Drogerie', { variable: 6000, n: 2, payee: 'Drogeriemarkt' }],
  [DAILY, 'Tanken', { variable: 12000, n: 3, payee: 'Tankstelle' }],
  [DAILY, 'Öffis', { variable: 5000, n: 1, payee: 'Verkehrsbetrieb' }],
  [DAILY, 'Essen gehen', { variable: 10000, n: 3, payee: 'Restaurant' }],
  [DAILY, 'Kaffee ☕', { variable: 3000, n: 4, payee: 'Café' }],
  [DAILY, 'Haustier', { variable: 4000, n: 1, payee: 'Tierhandlung' }],
  [FUN, 'Hobby', { variable: 5000, n: 1, payee: 'Bastelladen' }],
  [FUN, 'Sport - [€ 45,- am 12.]', { fixed: 4500, day: 12, payee: 'Sportverein' }],
  [FUN, 'Urlaub - [€ 150,-]', { save: 15000 }],
  [FUN, 'Kultur', null],
  [FUN, 'Bücher', null],
  [FUN, 'Geschenke', null],
  [PERIODIC, 'Kfz-Service', null],
  [PERIODIC, 'Kleidung', { variable: 8000, n: 1, payee: 'Modehaus' }],
  [PERIODIC, 'Gesundheit', { variable: 4000, n: 1, payee: 'Apotheke' }],
  [PERIODIC, 'Haushalt', { variable: 5000, n: 1, payee: 'Baumarkt' }],
  [PERIODIC, 'Elektronik', null],
  [PERIODIC, 'Möbel', null],
  [PERIODIC, 'Geburtstage', { variable: 3000, n: 1, payee: 'Geschenkeladen' }],
  [FUTURE, 'Notgroschen [€ 100,-]', { save: 10000 }],
  [FUTURE, 'Sparplan', { transfer: 20000, day: 2, to: 'Depot' }],
  [FUTURE, 'Krypto-Sparen', { transfer: 5000, day: 2, to: 'Krypto', from: '2024-02' }],
  [FUTURE, 'Neues Auto', { save: 10000 }],
  [FUTURE, 'Weiterbildung', { variable: 3000, n: 1, payee: 'Akademie' }],
  [CHILD, 'Windeln', { variable: 4000, n: 2, payee: 'Drogeriemarkt', from: '2024-06' }],
  [CHILD, 'Kinderbetreuung', { fixed: 25000, day: 5, payee: 'Kindergarten', from: '2024-09' }],
  [CHILD, 'Spielzeug', { variable: 2000, n: 1, payee: 'Spielwaren', from: '2024-06' }],
  [SIDE, 'Projekt A Material', { variable: 5000, n: 1, payee: 'Baumarkt' }],
  [SIDE, 'Projekt A Software', { fixed: 1200, day: 18, payee: 'Softwareanbieter', account: BLUE }],
  ['Auslagen', 'Auslagen Kontakt A', null],
  [CARDS, BLUE, null],
  [CARDS, GREEN, null],
  [HIDDEN, 'Hochzeit 2022', null],
  [HIDDEN, 'Alte Kategorie', null],
];
const RTA = ['Inflow', 'Ready to Assign'] as const;
/** Categories by name, also without their bracketed note. */
const byName = new Map<string, readonly [string, string]>(
  [...CATEGORIES.map(([g, n]) => [g, n] as const), RTA].flatMap((c) => [
    [c[1], c],
    [c[1].replace(/\s*-?\s*\[[^\]]*\]$/, ''), c],
  ]),
);
/** YNAB's register shows this hidden category under its original group. */
const ORIGINAL_GROUP: Record<string, string> = { 'Alte Kategorie': PERIODIC };
const cat = (name: string | null | undefined): readonly [string, string] | null => {
  if (!name) return null;
  const found = byName.get(name);
  if (!found) throw new Error(`Unknown category ${name}`);
  return found;
};

/**
 * One-off events per month: `assign` (category, cents), `row` (account, day, payee, cents,
 * category, memo), `transfer` (from, to, day, cents or `close` for the whole balance, category on
 * the on-budget leg, memo) and `split` (account, day, payee, lines: cents, category or
 * `Transfer : <account>`, memo).
 */
type Event =
  | ['assign', string, number]
  | ['row', string, number, string, number, string | null, string?]
  | ['transfer', string, string, number, number | 'close', (string | null)?, string?]
  | ['split', string, number, string, [number, string, string, string?][]];
const EVENTS: Record<string, Event[]> = {
  '2022-01': [['assign', 'Alte Kategorie', 12000]],
  '2022-02': [['row', GIRO, 14, 'Kaufhaus', -7000, 'Alte Kategorie']],
  '2022-07': [['row', GIRO, 15, 'Festsaal', -300000, 'Hochzeit 2022', 'Anzahlung "Saal"']],
  '2023-03': [['transfer', 'Altes Sparbuch', 'Tagesgeld', 15, 'close', null, 'Auflösung']],
  '2023-05': [
    ['assign', 'Auslagen Kontakt A', 50000],
    ['transfer', GIRO, 'Forderung Kontakt A', 10, 50000, 'Auslagen Kontakt A', 'Vorgestreckt'],
  ],
  '2023-07': [['row', GIRO, 31, 'Reconciliation Balance Adjustment', -1234, 'Ready to Assign']],
  // The card cases of docs/migration/ynab-export.md.
  '2024-05': [
    // Credit overspending: assigned 100 €, card 150 €.
    ['assign', 'Elektronik', 10000],
    ['row', BLUE, 12, 'Elektronikmarkt', -15000, 'Elektronik'],
    // Cash overspending: the same from the current account.
    ['assign', 'Möbel', 10000],
    ['row', GIRO, 14, 'Möbelhaus', -15000, 'Möbel'],
    // Mixed, cash first: 30 € cash, 120 € card.
    ['assign', 'Kultur', 10000],
    ['row', 'Bargeld', 9, 'Theater', -3000, 'Kultur'],
    ['row', BLUE, 16, 'Konzertkasse', -12000, 'Kultur'],
    // Mixed, all cash: 80 € cash, 70 € card.
    ['assign', 'Bücher', 10000],
    ['row', 'Bargeld', 6, 'Buchhandlung', -8000, 'Bücher'],
    ['row', BLUE, 21, 'Buchhandlung', -7000, 'Bücher'],
    // Covered later: card 150 €, assigned 100 € and 50 € more later in the month.
    ['row', GREEN, 5, 'Kaufhaus', -15000, 'Geschenke', 'Gutschein "Sommer"'],
    ['assign', 'Geschenke', 10000],
    ['assign', 'Geschenke', 5000],
    // Refund on the card: 60 € in May, 20 € back in June.
    ['assign', 'Kfz-Service', 6000],
    ['row', GREEN, 20, 'Werkstatt', -6000, 'Kfz-Service'],
  ],
  '2024-06': [['row', GREEN, 10, 'Werkstatt', 2000, 'Kfz-Service', 'Gutschrift']],
  // Card payments from the current account.
  '2024-07': [['transfer', GIRO, GREEN, 8, 6000]],
  '2024-08': [['transfer', GIRO, GREEN, 8, 13000]],
  // Card Grün again, figures checked by hand in ynab-export.test.ts: unfunded card spending …
  '2024-09': [
    ['assign', 'Möbel', 5000],
    ['row', GREEN, 14, 'Möbelhaus', -8000, 'Möbel'],
  ],
  // … a cash advance (card → budget account), spent from there …
  '2024-11': [
    ['transfer', GREEN, WALLET, 4, 4000, null, 'Aufladung'],
    ['assign', 'Kultur', 4000],
    ['row', WALLET, 6, 'Konzertkasse', -4000, 'Kultur'],
  ],
  // … and the whole card balance paid from the current account.
  '2024-12': [['transfer', GIRO, GREEN, 8, 12000]],
  '2025-03': [
    // A split with a payee per line.
    [
      'split',
      GIRO,
      15,
      'Blumenladen',
      [
        [-3000, 'Geschenke', 'Blumen', 'Blumenladen'],
        [-2500, 'Essen gehen', 'Abendessen', 'Restaurant'],
      ],
    ],
  ],
  '2024-10': [
    // A split with a transfer line, and a repayment of the advance.
    [
      'split',
      GIRO,
      12,
      'Supermarkt',
      [
        [-4000, '🛒 Lebensmittel', 'Einkauf'],
        [-10000, 'Transfer : Tagesgeld', 'Rücklage'],
      ],
    ],
    ['transfer', 'Forderung Kontakt A', GIRO, 20, 20000, 'Auslagen Kontakt A', 'Rückzahlung'],
  ],
  '2025-02': [['row', 'Bargeld', 28, 'Reconciliation Balance Adjustment', 500, 'Ready to Assign']],
  // Card rules found with the owner's real export (30.09.2026), figures checked by hand in
  // ynab-export.test.ts. April: the credit overspending is the latest card spending (all on Grün,
  // not shared with Blau), and a refund on Blau meets Bücher's credit overspending.
  '2025-04': [
    ['assign', 'Elektronik', 10000],
    ['row', BLUE, 5, 'Elektronikmarkt', -6000, 'Elektronik'],
    ['row', GREEN, 20, 'Elektronikmarkt', -12000, 'Elektronik'],
    ['row', GREEN, 12, 'Buchhandlung', -3500, 'Bücher'],
    ['row', BLUE, 22, 'Buchhandlung', 3000, 'Bücher', 'Rückgabe'],
  ],
  // May: Grün overpaid (positive balance), spending paid from it, a payment and a spend on one
  // day (largest outflow first), and income on the card (balance adjustment, Ready to Assign).
  '2025-05': [
    ['transfer', GIRO, GREEN, 3, 20500],
    ['assign', 'Kfz-Service', 6000],
    ['row', GREEN, 10, 'Werkstatt', -8000, 'Kfz-Service'],
    ['transfer', GIRO, GREEN, 17, 6000],
    ['assign', 'Kfz-Service', 2000],
    ['row', GREEN, 17, 'Werkstatt', -2000, 'Kfz-Service'],
    ['row', GREEN, 28, 'Reconciliation Balance Adjustment', 500, 'Ready to Assign'],
  ],
  // The remaining 15 € go back to the current account (a cash advance); the card is closed.
  '2025-06': [
    ['transfer', GREEN, GIRO, 5, 1500],
    ['transfer', 'Altes Girokonto', GIRO, 30, 'close', null, 'Auflösung'],
  ],
};
/** Future-dated, uncleared rows on the current account (YNAB exports them, up to 5 months ahead). */
const SCHEDULED: [string, string, string, number][] = [
  ['2026-10-01', 'Miete', 'Vermieter', -108961],
  ...['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map(
    (m): [string, string, string, number] => [`${m}-05`, 'Kinderbetreuung', 'Kindergarten', -25000],
  ),
];

interface Row {
  account: string;
  flag: string;
  date: string;
  payee: string;
  group: string;
  category: string;
  memo: string;
  cents: number;
}

/** The export as data (rows and plan), before it is written as TSV. */
export function ynabLedger(seed = 1) {
  const random = seeded(seed);
  const rows: Row[] = [];
  const assigned: Record<string, Record<string, number>> = {};
  const assign = (month: string, name: string, cents: number) => {
    const [g, n] = cat(name) as readonly [string, string];
    const row = (assigned[month] ??= {});
    row[`${g.trim()}: ${n.trim()}`] = (row[`${g.trim()}: ${n.trim()}`] ?? 0) + cents;
  };
  let scheduled = false;
  const push = (
    account: string,
    date: string,
    payee: string,
    cents: number,
    category?: string | null,
    memo = '',
  ) => {
    // Only the scheduled rows lie after the export date.
    if (date > YNAB_AS_OF && !scheduled) return;
    const r = random();
    const flag = r < 0.03 ? (FLAGS[Math.floor(r * 200)] ?? '') : '';
    const [group, name] = cat(category) ?? ['', ''];
    rows.push({ account, flag, date, payee, group, category: name, memo, cents });
  };
  const balanceOf = (account: string, until: string) =>
    rows.reduce((a, r) => (r.account === account && r.date <= until ? a + r.cents : a), 0);
  /** Both legs; a category goes on the on-budget leg when the other one is off budget. */
  const transfer = (
    from: string,
    to: string,
    date: string,
    cents: number,
    category?: string | null,
    memo = '',
  ) => {
    for (const [a, b, sign] of [
      [from, to, -1],
      [to, from, 1],
    ] as const)
      push(
        a,
        date,
        `Transfer : ${b}`,
        sign * cents,
        onBudget.get(a) && !onBudget.get(b) ? category : null,
        memo,
      );
  };
  const split = (
    account: string,
    date: string,
    payee: string,
    lines: [number, string, string, string?][],
  ) =>
    lines.forEach(([cents, name, memo, own], i) => {
      const leg = name.startsWith('Transfer : ') ? name.slice(11) : null;
      push(
        account,
        date,
        leg ? name : (own ?? payee),
        cents,
        leg ? null : name,
        `Split (${i + 1}/${lines.length}) ${memo}`,
      );
      if (leg) push(leg, date, `Transfer : ${account}`, -cents, null, memo);
    });

  for (const [name, on, date, cents] of ACCOUNTS)
    push(name, date, 'Starting Balance', cents, on ? 'Ready to Assign' : null);
  for (const month of monthsBetween(FIRST_MONTH, '2026-09')) {
    const end = lastDayOfMonth(month);
    const day = (d: number) =>
      `${month}-${String(Math.min(d, Number(end.slice(8)))).padStart(2, '0')}`;
    const year = Number(month.slice(0, 4)) - 2022;
    const mm = Number(month.slice(5));
    push(GIRO, day(25), 'Arbeitgeber', 420000 + year * 12000, 'Ready to Assign');
    transfer(GIRO, 'Haushaltskonto', day(2), 20000);
    transfer(GIRO, 'Bargeld', day(3), 20000, null, 'Bargeldbehebung');
    // Last month's card statement is paid in full.
    const blue = balanceOf(BLUE, lastDayOfMonth(addMonths(month, -1)));
    if (blue < 0) transfer(GIRO, BLUE, day(8), -blue);
    if (month <= '2022-06') assign(month, 'Hochzeit 2022', 50000);
    for (const [, name, spec] of CATEGORIES) {
      if (!spec || ('from' in spec && spec.from && month < spec.from)) continue;
      if ('save' in spec) assign(month, name, spec.save);
      else if ('transfer' in spec) {
        if (spec.until && month >= spec.until) continue;
        assign(month, name, spec.transfer);
        transfer(GIRO, spec.to, day(spec.day), spec.transfer, name);
      } else if ('fixed' in spec) {
        // Yearly payments are saved for in twelfths.
        const months = spec.months ?? [];
        assign(
          month,
          name,
          months.length ? Math.round((spec.fixed * months.length) / 12) : spec.fixed,
        );
        if (!months.length || months.includes(mm))
          push(spec.account ?? GIRO, day(spec.day), spec.payee, -spec.fixed, name);
      } else {
        assign(month, name, spec.variable);
        for (let i = 0; i < spec.n; i++) {
          const cents = Math.round((spec.variable / spec.n) * (0.55 + random()));
          const r = random();
          const account = r < 0.4 ? GIRO : r < 0.7 ? BLUE : r < 0.85 ? 'Haushaltskonto' : 'Bargeld';
          const date = day(1 + Math.floor(random() * 28));
          if (name === '🛒 Lebensmittel' && i % 4 === 3)
            split(account, date, spec.payee, [
              [-cents, name, 'Wocheneinkauf'],
              [-Math.round(cents / 5), 'Drogerie', 'Seife'],
              [-Math.round(cents / 7), 'Haushalt', 'Putzmittel'],
            ]);
          else push(account, date, spec.payee, -cents, name);
        }
      }
    }
    if (month < '2025-07')
      push('Altes Girokonto', day(28), 'Bank', -290, 'Haushalt', 'Kontoführung');
    // Value changes of the tracking accounts and the loan's interest.
    push('Depot', end, 'Manual Balance Adjustment', Math.round((random() - 0.35) * 40000));
    push('Wohnkredit', end, 'Manual Balance Adjustment', -(52000 - year * 1500), null, 'Zinsen');
    if (month >= '2024-02')
      push('Krypto', end, 'Manual Balance Adjustment', Math.round((random() - 0.4) * 8000));
    if (mm === 12) push('Tagesgeld', day(31), 'Bank', 1250, 'Ready to Assign', 'Zinsen');
    if (mm === 6 || mm === 12) transfer(GIRO, 'Tagesgeld', day(27), 20000);
    // The wallet is topped up from the card (cash advance) and spent from.
    if (mm % 4 === 1) {
      transfer(BLUE, WALLET, day(6), 5000);
      push(WALLET, day(7), 'Onlinehändler', -5000, 'Hobby');
    }
    for (const e of EVENTS[month] ?? []) {
      if (e[0] === 'assign') assign(month, e[1], e[2]);
      if (e[0] === 'row') push(e[1], day(e[2]), e[3], e[4], e[5], e[6]);
      if (e[0] === 'split') split(e[1], day(e[2]), e[3], e[4]);
      if (e[0] === 'transfer') {
        const cents = e[4] === 'close' ? balanceOf(e[1], day(e[3])) : e[4];
        transfer(e[1], e[2], day(e[3]), cents, e[5], e[6]);
      }
    }
  }
  scheduled = true;
  for (const [date, name, payee, cents] of SCHEDULED) push(GIRO, date, payee, cents, name);
  assign(LAST_MONTH, 'Miete', 108961);
  assign(LAST_MONTH, 'Kinderbetreuung', 25000);

  const order = new Map(ACCOUNTS.map(([name], i) => [name, i]));
  rows.sort(
    (a, b) =>
      (order.get(a.account) ?? 0) - (order.get(b.account) ?? 0) || a.date.localeCompare(b.date),
  );
  return { rows, months: monthsBetween(FIRST_MONTH, LAST_MONTH), plan: planOf(rows, assigned) };
}

/** Activity and Available per category and month by YNAB's rule. */
function planOf(rows: Row[], assigned: Record<string, Record<string, number>>) {
  const key = (g: string, n: string) => `${g.trim()}: ${n.trim()}`;
  // YNAB's plan does not count rows after the export date yet.
  const splits: LedgerSplit[] = rows
    .filter((r) => r.date <= YNAB_AS_OF)
    .map((r) => ({
      accountId: r.account,
      date: r.date,
      amountCents: r.cents,
      categoryId: r.category && r.group !== 'Inflow' ? key(r.group, r.category) : null,
      transferAccountId: r.payee.startsWith('Transfer : ') ? r.payee.slice(11) : null,
    }));
  const months = monthsBetween(FIRST_MONTH, LAST_MONTH);
  const result = budgetMonths({
    accounts: ACCOUNTS.map(([id, on]) => ({
      id,
      onBudget: on,
      openingDate: '2000-01-01',
      openingBalanceCents: 0,
    })),
    categories: CATEGORIES.map(([g, n]) => ({
      id: key(g, n),
      kind: g === CARDS ? 'card_payment' : 'variable',
      cardAccountId: g === CARDS ? n : null,
    })),
    splits,
    months,
    assigned,
    cardRule: 'ynab',
  });
  return result.flatMap((m) =>
    CATEGORIES.map(([group, name]) => {
      const e = m.envelopes[key(group, name)];
      return {
        month: m.month,
        group,
        name,
        assigned: e?.assignedCents ?? 0,
        activity: e?.activityCents ?? 0,
        available: e?.availableCents ?? 0,
      };
    }),
  );
}

const FLAGS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const euro = (cents: number) => {
  const a = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}€${Math.floor(a / 100)},${String(a % 100).padStart(2, '0')}`;
};
/** Text fields in double quotes; the amount columns (indexes in `bare`) unquoted, as in YNAB. */
const line = (fields: string[], bare: ReadonlySet<number> = new Set()) =>
  `${fields.map((f, i) => (bare.has(i) ? f : `"${f.replaceAll('"', '""')}"`)).join('\t')}\r\n`;
const REGISTER_AMOUNTS = new Set([8, 9]);
const PLAN_AMOUNTS = new Set([4, 5, 6]);
const cleared = (date: string) => {
  if (date > YNAB_AS_OF || date >= '2026-09-26') return 'Uncleared';
  return date >= '2026-08-15' ? 'Cleared' : 'Reconciled';
};

/** Both files, byte-exact in YNAB's format. Deterministic by seed. */
export function ynabExport(seed = 1): { register: Uint8Array; plan: Uint8Array } {
  const { rows, plan } = ynabLedger(seed);
  const register = [
    line(
      'Account|Flag|Date|Payee|Category Group/Category|Category Group|Category|Memo|Outflow|Inflow|Cleared'.split(
        '|',
      ),
    ),
    ...rows.map((r) =>
      line(
        [
          r.account === WALLET ? `${WALLET} ` : r.account,
          r.flag,
          `${r.date.slice(8)}.${r.date.slice(5, 7)}.${r.date.slice(0, 4)}`,
          r.payee,
          r.category ? `${ORIGINAL_GROUP[r.category] ?? r.group}: ${r.category}` : '',
          ORIGINAL_GROUP[r.category] ?? r.group,
          r.category,
          r.memo,
          euro(Math.max(0, -r.cents)),
          euro(Math.max(0, r.cents)),
          cleared(r.date),
        ],
        REGISTER_AMOUNTS,
      ),
    ),
  ];
  const planLines = [
    line(
      'Month|Category Group/Category|Category Group|Category|Assigned|Activity|Available'.split(
        '|',
      ),
    ),
    ...plan.map((p) =>
      line(
        [
          `${MONTHS[Number(p.month.slice(5)) - 1]} ${p.month.slice(0, 4)}`,
          `${p.group}: ${p.name}`,
          p.group,
          p.name,
          euro(p.assigned),
          euro(p.activity),
          euro(p.available),
        ],
        PLAN_AMOUNTS,
      ),
    ),
  ];
  // Some rows carry their emoji CESU-8 encoded, as YNAB writes them.
  return {
    register: encode(register, (i) => i % 3 === 1),
    plan: encode(planLines, (i) => i % 2 === 0),
  };
}

function encode(lines: string[], cesu: (index: number) => boolean): Uint8Array {
  const utf8 = new TextEncoder();
  const parts = [
    Uint8Array.of(0xef, 0xbb, 0xbf),
    ...lines.map((l, i) => (i > 0 && cesu(i) ? cesu8(l) : utf8.encode(l))),
  ];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** UTF-8 of each UTF-16 code unit: characters outside the BMP become two 3-byte surrogates. */
function cesu8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const u = text.charCodeAt(i);
    if (u < 0x80) out.push(u);
    else if (u < 0x800) out.push(0xc0 | (u >> 6), 0x80 | (u & 63));
    else out.push(0xe0 | (u >> 12), 0x80 | ((u >> 6) & 63), 0x80 | (u & 63));
  }
  return Uint8Array.from(out);
}
