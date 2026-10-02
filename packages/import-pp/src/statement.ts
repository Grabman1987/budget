import { z } from 'zod';
import { addDays } from '@budget/domain';
import { matchFlows, type FlowItem } from './flows';

/**
 * Platform statements: the cash account statement of a broker, as the bank's source of truth for
 * one cash account (`docs/migration/pp-export.md`, "Platform statement"). A mapping entry points
 * to a file and names its format; the parser turns it into typed rows, the planner says which rows
 * the app already has (YNAB transfers, PP trades and cash items) and which it has to add. Pure:
 * the server applies the plan (`apps/server/src/imports/pp-statement.ts`). The first format is the
 * Flatex "Cashkonto" export (tab separated, German numbers); the Trade Republic statement next.
 */

export const STATEMENT_FORMATS = ['flatex-cashkonto'] as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

export const statementConfigSchema = z.object({
  format: z.enum(STATEMENT_FORMATS),
  /** Path of the file (relative to the mapping document); staged with the run, never committed. */
  file: z.string().min(1),
  /** The statement's real balance on a day; the opening balance follows from it. */
  closing: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cents: z.number().int() }),
  /** App account the platform's external transfers go to and come from (the bank account). */
  bank: z.string().min(1),
});
export type StatementConfig = z.infer<typeof statementConfigSchema>;

export type StatementKind =
  | 'transfer'
  | 'order-buy'
  | 'order-sell'
  | 'distribution'
  | 'deemed-tax'
  | 'interest'
  | 'tax-correction'
  | 'expiry'
  | 'other';

export interface StatementRow {
  /** Booking day. */
  day: string;
  valuta: string;
  cents: number;
  /** The platform's reference of the booking (`ta_nr`), unique within a statement. */
  ref: string;
  counterparty: string;
  info: string;
  kind: StatementKind;
  isin: string | null;
  order: string | null;
}

export class StatementError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
    this.name = 'StatementError';
  }
}

const ISIN = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
const day = (text: string, line: number): string => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) throw new StatementError(line, 'Invalid date');
  return `${m[3]}-${m[2]}-${m[1]}`;
};
const money = (text: string, line: number): number => {
  const m = /^(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/.exec(text.trim());
  if (!m) throw new StatementError(line, 'Invalid amount');
  const cents = Number((m[2] as string).replace(/\./g, '')) * 100 + Number(m[3]);
  return m[1] === '-' ? -cents : cents;
};

function kindOf(counterparty: string, info: string): StatementKind {
  if (counterparty.trim() !== '') return 'transfer';
  if (/Ausführung ORDER Kauf/.test(info)) return 'order-buy';
  if (/Ausführung ORDER Verkauf/.test(info)) return 'order-sell';
  if (/Ablauf der Optionsfrist/.test(info)) return 'expiry';
  if (/Erträgnis/.test(info)) return 'distribution';
  if (/Thesaurierung/.test(info)) return 'deemed-tax';
  if (/Zinsabschluss/.test(info)) return 'interest';
  if (/Steuerkorrektur/.test(info)) return 'tax-correction';
  return 'other';
}

/** Flatex Cashkonto export: `buchtag valuta betrag ta_nr empfaenger buchungsinfo`, newest first. */
export function parseFlatexCashkonto(text: string): StatementRow[] {
  const lines = text.split(/\r?\n/);
  const header = (lines[0] ?? '').split('\t').map((h) => h.trim().toLowerCase());
  const want = ['buchtag', 'valuta', 'betrag', 'ta_nr', 'empfaenger', 'buchungsinfo'];
  if (want.some((w, i) => header[i] !== w)) throw new StatementError(1, 'Unexpected header');
  const rows: StatementRow[] = [];
  const seen = new Set<string>();
  lines.forEach((raw, i) => {
    if (i === 0 || raw.trim() === '') return;
    const f = raw.split('\t');
    if (f.length !== 6) throw new StatementError(i + 1, 'Expected 6 columns');
    const [buchtag, valuta, betrag, ref, who, info] = f as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    if (seen.has(ref)) throw new StatementError(i + 1, 'Duplicate booking reference');
    seen.add(ref);
    rows.push({
      day: day(buchtag, i + 1),
      valuta: day(valuta, i + 1),
      cents: money(betrag, i + 1),
      ref: ref.trim(),
      counterparty: who.trim(),
      info: info.trim(),
      kind: kindOf(who, info),
      isin: ISIN.exec(info)?.[1] ?? null,
      order: /\b(\d{6,12})\s*$/.exec(info.trim())?.[1] ?? null,
    });
  });
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.ref.localeCompare(b.ref));
}

export function parseStatement(format: StatementFormat, text: string): StatementRow[] {
  switch (format) {
    case 'flatex-cashkonto':
      return parseFlatexCashkonto(text);
  }
}

// ---- planning ---------------------------------------------------------------------------------

/** What the app will have on the cash account from PP alone (trades' cash, interest, fees). */
export interface ExpectedItem {
  date: string;
  /** Signed cash on the cash account (a buy is negative). */
  cents: number;
  /** Import key of the trade or booking. */
  key: string;
  isin: string | null;
  kind: 'trade' | 'booking';
}

/** A PP delivery in: no cash in PP, while the statement shows the purchase. */
export interface DeliveryItem {
  key: string;
  date: string;
  isin: string | null;
  amountCents: number;
}

export interface StatementPlan {
  /** Rows of the statement the app has through PP (exact, date shifted or split). */
  matched: number;
  /** PP deliveries that become purchases with the cash of a statement row. */
  conversions: { key: string; amountCents: number; row: StatementRow }[];
  /** Rows PP does not have: orders (go to the old-holdings security), income and costs. */
  gap: StatementRow[];
  /** PP items without a row of the statement (left alone and listed). */
  ppOnly: ExpectedItem[];
}

/**
 * Which non-transfer rows PP covers. Rows are matched against PP's expected cash items by amount
 * within a few days, a row may be several PP items (a sale and its tax refund). A purchase row
 * left over is matched with a PP delivery of the same ISIN and day whose amount is close: the
 * delivery then carries the statement's cash (`conversions`). Everything else is `gap`.
 */
export function planStatementRows(
  rows: readonly StatementRow[],
  expected: readonly ExpectedItem[],
  deliveries: readonly DeliveryItem[],
  days = 5,
): StatementPlan {
  const own = rows.filter((r) => r.kind !== 'transfer' && r.cents !== 0);
  const byRef = new Map(own.map((r) => [r.ref, r]));
  const items = new Map(expected.map((e) => [e.key, e]));
  const result = matchFlows(
    own.map((r): FlowItem => ({ date: r.day, cents: r.cents, ref: r.ref })),
    expected.map((e): FlowItem => ({ date: e.date, cents: e.cents, ref: e.key })),
    { exactDays: days, shiftDays: days, splitDays: days, roundTripDays: -1, aggregate: false },
  );
  const matched = result.exact + result.dateShifted.length + result.split.length;
  const left = result.ppOnly.map((f) => byRef.get(f.ref as string) as StatementRow);
  const conversions: StatementPlan['conversions'] = [];
  const usedDelivery = new Set<string>();
  const gap: StatementRow[] = [];
  for (const row of left) {
    if (row.kind === 'order-buy' && row.isin !== null) {
      const d = deliveries.find(
        (x) =>
          !usedDelivery.has(x.key) &&
          x.isin === row.isin &&
          Math.abs(Date.parse(x.date) - Date.parse(row.day)) / 86_400_000 <= 3 &&
          Math.abs(x.amountCents - -row.cents) <= Math.max(1_000, Math.round(-row.cents * 0.05)),
      );
      if (d) {
        usedDelivery.add(d.key);
        conversions.push({ key: d.key, amountCents: -row.cents, row });
        continue;
      }
    }
    gap.push(row);
  }
  return {
    matched,
    conversions,
    gap,
    ppOnly: result.appOnly.map((f) => items.get(f.ref as string) as ExpectedItem),
  };
}

/** Euro cents as units of the old-holdings security (1 unit = 1 EUR, price 1,000000). */
export const oldUnitsE8 = (cents: number): number => cents * 1_000_000;

/** Last day of the gap: the old holdings are handed over to PP's own from there. */
export function handoverDay(gap: readonly StatementRow[], opening: string): string {
  const orders = gap.filter((r) => r.kind.startsWith('order') || r.kind === 'expiry');
  return orders.reduce((a, r) => (r.day > a ? r.day : a), addDays(opening, 0));
}
