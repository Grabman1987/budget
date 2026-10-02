import { matchFlows, type FlowItem, type FlowMatchResult } from './flows';
import { StatementError } from './statement';

/**
 * Trade Republic sources for the reconciliation report (`apps/server/src/imports/pp-tr-abgleich.ts`):
 * the transaction list of the web app (tab separated: `datum name status betrag`, ISO dates, signed
 * amounts with a decimal point) and a pytr export (`account_transactions.csv`, semicolon separated,
 * with ISIN, units, fees and taxes). Pure parsing and comparison; the server reads the ledger.
 */

export type TrKind =
  | 'card'
  | 'deposit'
  | 'transfer-in'
  | 'transfer-out'
  | 'interest'
  | 'savings-plan'
  | 'round-up'
  | 'order-buy'
  | 'order-sell'
  | 'saveback'
  /** Not executed or no cash effect: rejected, cancelled, card check, an open limit order. */
  | 'ignored';

export interface TrRow {
  day: string;
  name: string;
  status: string;
  cents: number;
  kind: TrKind;
}

const kindOf = (name: string, status: string): TrKind => {
  switch (status) {
    case 'Abgelehnt':
    case 'Abgebrochen':
    case 'Kartenprüfung':
    case 'Limit-Buy-Order':
      return 'ignored';
    case 'Sparplan ausgeführt':
      return 'savings-plan';
    case 'Round up':
      return 'round-up';
    case 'Saveback':
      return 'saveback';
    case 'Kauforder':
      return 'order-buy';
    case 'Verkaufsorder':
      return 'order-sell';
    case 'Gesendet':
      return 'transfer-out';
    case 'Fertig':
      return 'transfer-in';
    case '2 % p.a.':
      return 'interest';
    default:
      return name === 'Einzahlung' ? 'deposit' : name === 'Zinsen' ? 'interest' : 'card';
  }
};

export function parseTradeRepublicWeb(text: string): TrRow[] {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== 'datum\tname\tstatus\tbetrag')
    throw new StatementError(1, 'Unexpected header');
  const rows: TrRow[] = [];
  lines.forEach((raw, i) => {
    if (i === 0 || raw.trim() === '') return;
    const f = raw.split('\t');
    if (f.length !== 4) throw new StatementError(i + 1, 'Expected 4 columns');
    const [day, name, status, amount] = f as [string, string, string, string];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new StatementError(i + 1, 'Invalid date');
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount.trim()))
      throw new StatementError(i + 1, 'Invalid amount');
    const [int, dec = ''] = amount.trim().replace('-', '').split('.');
    const cents = Number(int) * 100 + Number(dec.padEnd(2, '0'));
    rows.push({
      day,
      name: name.trim(),
      status: status.trim(),
      cents: amount.trim().startsWith('-') ? -cents : cents,
      kind: kindOf(name.trim(), status.trim()),
    });
  });
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}

export interface PytrRow {
  day: string;
  type: string;
  cents: number;
  note: string;
  isin: string | null;
  unitsE8: number | null;
  feeCents: number;
  taxCents: number;
}

const decimal = (text: string, scale: number): number | null => {
  const t = text.trim();
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new StatementError(0, 'Invalid number');
  const neg = t.startsWith('-');
  const [int, dec = ''] = t.replace('-', '').split('.');
  const v = Number(int) * 10 ** scale + Number(dec.padEnd(scale, '0').slice(0, scale));
  return neg ? -v : v;
};

/** pytr `account_transactions.csv`: `Datum;Typ;Wert;Notiz;ISIN;Stück;Gebühren;Steuern;ISIN2;Stück2`. */
export function parsePytrCsv(text: string): PytrRow[] {
  const lines = text.split(/\r?\n/);
  if (!(lines[0] ?? '').startsWith('Datum;Typ;Wert;Notiz;ISIN;Stück;Gebühren;Steuern'))
    throw new StatementError(1, 'Unexpected header');
  const out: PytrRow[] = [];
  lines.forEach((raw, i) => {
    if (i === 0 || raw.trim() === '') return;
    const f = raw.split(';');
    try {
      out.push({
        day: (f[0] ?? '').slice(0, 10),
        type: f[1] ?? '',
        cents: decimal(f[2] ?? '', 2) ?? 0,
        note: f[3] ?? '',
        isin: (f[4] ?? '').trim() || null,
        unitsE8: decimal(f[5] ?? '', 8),
        feeCents: Math.abs(decimal(f[6] ?? '', 2) ?? 0),
        taxCents: Math.abs(decimal(f[7] ?? '', 2) ?? 0),
      });
    } catch {
      throw new StatementError(i + 1, 'Invalid number');
    }
  });
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export interface TrCashSummary {
  /** Sum of the rows with a cash effect (no ignored rows, no Saveback). */
  cashCents: number;
  byKind: Record<string, { count: number; cents: number }>;
  first: string | null;
  last: string | null;
}

export function summarizeTr(rows: readonly TrRow[]): TrCashSummary {
  const byKind: TrCashSummary['byKind'] = {};
  let cash = 0;
  for (const r of rows) {
    const e = (byKind[r.kind] ??= { count: 0, cents: 0 });
    e.count += 1;
    e.cents += r.cents;
    if (r.kind !== 'ignored' && r.kind !== 'saveback') cash += r.cents;
  }
  return {
    cashCents: cash,
    byKind,
    first: rows[0]?.day ?? null,
    last: rows.at(-1)?.day ?? null,
  };
}

export const isInvestmentKind = (k: TrKind): boolean =>
  k === 'savings-plan' || k === 'round-up' || k === 'order-buy' || k === 'order-sell';

/** Rows of the web list that move cash outside the depot (card, deposits, transfers, interest). */
export const isCashKind = (k: TrKind): boolean =>
  k === 'card' ||
  k === 'deposit' ||
  k === 'transfer-in' ||
  k === 'transfer-out' ||
  k === 'interest';

export interface UnitCheck {
  /** Trades in the export (buys and sales with an ISIN). */
  trades: number;
  /** Positions (per ISIN) whose units at the end of the export equal PP's. */
  positionsEqual: number;
  /** Month ends (up to the export's last day) at which an ISIN's units differ, with both figures. */
  differing: { month: string; isin: string; pytrUnitsE8: number; ppUnitsE8: number }[];
  /** ISINs with units in the export but no trade in PP at all. */
  missingInPp: string[];
}

const monthEnd = (month: string): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * Units per ISIN at every month end up to the export's last day: the export's buys and sales
 * (summed, so an order PP books in two parts equals it) against the depot's trades in PP. PP may
 * book an execution one day apart; a month end shows a real difference only when it persists,
 * so the figures are compared at month ends and at the end of the export.
 */
export function checkUnits(
  pytr: readonly PytrRow[],
  pp: readonly { day: string; isin: string | null; unitsE8: number }[],
  toDay: string,
): UnitCheck {
  const trades = pytr.filter((r) => (r.type === 'Kauf' || r.type === 'Verkauf') && r.isin);
  const isins = [...new Set(trades.map((r) => r.isin as string))].sort();
  const months = [
    ...new Set(trades.map((r) => r.day.slice(0, 7)).concat([toDay.slice(0, 7)])),
  ].sort();
  const units = (
    list: readonly { day: string; isin: string | null; unitsE8: number }[],
    isin: string,
    to: string,
  ) => list.filter((x) => x.isin === isin && x.day <= to).reduce((a, x) => a + x.unitsE8, 0);
  const signed = trades.map((r) => ({
    day: r.day,
    isin: r.isin,
    unitsE8: (r.type === 'Kauf' ? 1 : -1) * Math.abs(r.unitsE8 ?? 0),
  }));
  const result: UnitCheck = {
    trades: trades.length,
    positionsEqual: 0,
    differing: [],
    missingInPp: [],
  };
  for (const isin of isins) {
    if (!pp.some((p) => p.isin === isin)) result.missingInPp.push(isin);
    if (units(signed, isin, toDay) === units(pp, isin, toDay)) result.positionsEqual += 1;
    let last = '';
    for (const month of months) {
      const end = monthEnd(month) > toDay ? toDay : monthEnd(month);
      const a = units(signed, isin, end);
      const b = units(pp, isin, end);
      if (a !== b && month !== last)
        result.differing.push({ month, isin, pytrUnitsE8: a, ppUnitsE8: b });
      last = month;
    }
  }
  return result;
}

export interface CashComparison {
  result: FlowMatchResult;
  statementRows: number;
  appRows: number;
}

/** Statement rows against the app's bookings of one account, by amount and day (`matchFlows`). */
export function compareCash(
  statement: readonly FlowItem[],
  app: readonly FlowItem[],
): CashComparison {
  return {
    result: matchFlows(statement, app, {
      exactDays: 3,
      shiftDays: 7,
      splitDays: 5,
      roundTripDays: -1,
      aggregate: false,
    }),
    statementRows: statement.length,
    appRows: app.length,
  };
}
