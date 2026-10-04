import { parseScaledDecimal, unitsRuleViolation, type TradeKind } from '@budget/domain';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { account, booking, security, TRADE_KINDS } from '../schema';
import type { AuditContext, GroupedContext } from './audit';
import { createTransfer, deleteBooking } from './bookings';
import { ReconciledLockedError } from './errors';
import { accountSummaries } from './ledger-queries';
import { OperatorInputError } from './operator-ops';
import {
  createTrade,
  deleteTrade,
  listTrades,
  tradeCashTransferInput,
  type TradeRow,
} from './trades';
import { runInTransaction, type Executor } from './types';

interface Match {
  account: string;
  security?: string;
  isin?: string;
  date: string;
  tradeKind: TradeKind | 'reward';
  units?: string;
  amountCents?: number;
}
type Add = Match & {
  kind: 'add';
  id: string;
  units: string;
  amountCents: number;
  feeCents: number;
  taxCents: number;
  importKey: string;
  note?: string;
  cashAccount?: string;
};
type Entry = Add | { kind: 'delete'; id: string; match: Match };
export interface OwnerTradesFile {
  trades: Entry[];
}
export interface OwnerTradeOutcome extends Match {
  id: string;
  status: 'added' | 'unchanged' | 'deleted' | 'skipped';
  reason: string;
  detail: string;
  groupId: string;
  affectedAccounts?: string[];
}
class DryRunRollback extends Error {}
class EntrySkip extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}
const fold = (v: string) => v.trim().toLocaleLowerCase('de-AT');
const text =
  (max: number) =>
  (v: unknown, at: string): string => {
    if (
      typeof v !== 'string' ||
      !v.trim() ||
      v.length > max ||
      /[\r\n]/.test(v) ||
      v.includes('\0')
    )
      throw new OperatorInputError(`${at} must be non-empty text, at most ${max} characters`);
    return v.trim();
  };
function object(v: unknown, at: string, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new OperatorInputError(`${at} must be an object`);
  for (const key of Object.keys(v))
    if (!keys.includes(key)) throw new OperatorInputError(`${at}: unknown key ${key}`);
  return v as Record<string, unknown>;
}
function cents(v: unknown, at: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
    throw new OperatorInputError(`${at} must be non-negative integer cents`);
  return v;
}
function units(v: unknown, at: string): string {
  if (typeof v !== 'string' || !/^[+-]?\d+(\.\d{1,8})?$/.test(v) || v.length > 40)
    throw new OperatorInputError(`${at} must be a decimal string with at most 8 decimals`);
  try {
    parseScaledDecimal(v, 8);
  } catch {
    throw new OperatorInputError(`${at} exceeds safe 1e-8 units`);
  }
  return v;
}
const MATCH_KEYS = ['account', 'security', 'isin', 'date', 'tradeKind', 'units', 'amountCents'];
function match(o: Record<string, unknown>, at: string): Match {
  const date = text(10)(o['date'], `${at}.date`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new OperatorInputError(`${at}.date must be a valid day (YYYY-MM-DD)`);
  const tradeKind = o['tradeKind'];
  if (typeof tradeKind !== 'string' || ![...TRADE_KINDS, 'reward'].includes(tradeKind))
    throw new OperatorInputError(`${at}.tradeKind is unsupported`);
  if ((o['security'] === undefined) === (o['isin'] === undefined))
    throw new OperatorInputError(`${at}: give security or isin, exactly one`);
  const out: Match = {
    account: text(80)(o['account'], `${at}.account`),
    date,
    tradeKind: tradeKind as Match['tradeKind'],
  };
  if (o['security'] !== undefined) out.security = text(120)(o['security'], `${at}.security`);
  if (o['isin'] !== undefined) {
    out.isin = text(12)(o['isin'], `${at}.isin`).toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(out.isin))
      throw new OperatorInputError(`${at}.isin must be a 12 character ISIN`);
  }
  if (o['units'] !== undefined) out.units = units(o['units'], `${at}.units`);
  if (o['amountCents'] !== undefined)
    out.amountCents = cents(o['amountCents'], `${at}.amountCents`);
  return out;
}
/** Validate the complete private file before entering any write transaction. */
export function parseOwnerTradesFile(json: unknown): OwnerTradesFile {
  const root = object(json, 'The file', ['trades']);
  if (!Array.isArray(root['trades']) || root['trades'].length > 500)
    throw new OperatorInputError('trades must be a list of at most 500 entries');
  const ids = new Set<string>();
  return {
    trades: root['trades'].map((v, i): Entry => {
      const at = `trades[${i}]`;
      const o = object(v, at, [
        'kind',
        'id',
        'match',
        ...MATCH_KEYS,
        'feeCents',
        'taxCents',
        'note',
        'importKey',
        'cashAccount',
      ]);
      const id = text(100)(o['id'], `${at}.id`);
      if (ids.has(fold(id))) throw new OperatorInputError(`${at}.id is listed twice`);
      ids.add(fold(id));
      if (o['kind'] === 'delete') {
        object(o, at, ['id', 'kind', 'match']);
        return {
          id,
          kind: 'delete',
          match: match(object(o['match'], `${at}.match`, MATCH_KEYS), `${at}.match`),
        };
      }
      if (o['kind'] !== 'add') throw new OperatorInputError(`${at}.kind must be add or delete`);
      object(o, at, [
        'id',
        'kind',
        ...MATCH_KEYS,
        'feeCents',
        'taxCents',
        'note',
        'importKey',
        'cashAccount',
      ]);
      const out: Add = {
        ...match(o, at),
        kind: 'add',
        id,
        units: units(o['units'], `${at}.units`),
        amountCents: cents(o['amountCents'], `${at}.amountCents`),
        feeCents: cents(o['feeCents'] === undefined ? 0 : o['feeCents'], `${at}.feeCents`),
        taxCents: cents(o['taxCents'] === undefined ? 0 : o['taxCents'], `${at}.taxCents`),
        importKey: text(200)(o['importKey'], `${at}.importKey`),
      };
      if (
        out.amountCents === 0 &&
        !['delivery_in', 'delivery_out', 'split'].includes(out.tradeKind)
      )
        throw new OperatorInputError(`${at}.amountCents must be positive for ${out.tradeKind}`);
      if (o['note'] !== undefined) out.note = text(500)(o['note'], `${at}.note`);
      if (o['cashAccount'] !== undefined)
        out.cashAccount = text(80)(o['cashAccount'], `${at}.cashAccount`);
      if (out.tradeKind === 'reward' && (out.cashAccount || out.feeCents || out.taxCents))
        throw new OperatorInputError(`${at}: reward has no cashAccount, fee or tax`);
      return out;
    }),
  };
}
function one<T>(rows: T[], reason: string): T {
  if (!rows.length) throw new EntrySkip(reason, 'no live match');
  if (rows.length !== 1) throw new EntrySkip('ambiguous', 'more than one match');
  return rows[0]!;
}
function oneAccount(tx: Executor, name: string) {
  const a = one(
    tx
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .all()
      .filter((a) => fold(a.name) === fold(name)),
    'unknown_account',
  );
  if (a.closedAt) throw new EntrySkip('closed_account', 'account is closed');
  return a;
}
function rewardDividend(tx: Executor, buy: TradeRow): TradeRow {
  const key = buy.importKey;
  if (!key?.endsWith(':buy')) throw new EntrySkip('not_found', 'no reward key');
  const div = one(
    listTrades(tx, {
      accountId: buy.accountId,
      securityId: buy.securityId,
      from: buy.date,
      to: buy.date,
    }).filter((t) => t.kind === 'dividend' && t.importKey === `${key.slice(0, -4)}:div`),
    'not_found',
  );
  if (
    div.amountCents !== buy.amountCents ||
    buy.feeCents ||
    buy.taxCents ||
    div.feeCents ||
    div.taxCents
  )
    throw new EntrySkip('conflict', 'reward legs differ');
  return div;
}
function applyEntry(
  tx: Executor,
  e: Entry,
  ctx: GroupedContext,
): Pick<OwnerTradeOutcome, 'status' | 'units' | 'amountCents' | 'affectedAccounts'> {
  const m = e.kind === 'add' ? e : e.match;
  const a = oneAccount(tx, m.account);
  if (a.role !== 'investment')
    throw new EntrySkip('invalid_account', 'trades need an investment account');
  const s = one(
    tx
      .select()
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .filter((s) => (m.isin ? s.isin === m.isin : fold(s.name) === fold(m.security!))),
    'unknown_security',
  );
  if (e.kind === 'add') {
    if (e.tradeKind === 'reward' && a.currency !== 'EUR')
      throw new EntrySkip('invalid_currency', 'reward value must be booked in EUR');
    const unitsE8 = parseScaledDecimal(e.units, 8);
    const violation = unitsRuleViolation(e.tradeKind === 'reward' ? 'buy' : e.tradeKind, unitsE8);
    if (violation) throw new EntrySkip('unitsRuleViolation', violation);
    const cash = e.cashAccount ? oneAccount(tx, e.cashAccount) : null;
    if (cash && a.referenceAccountId !== cash.id)
      throw new EntrySkip(
        'invalid_cash_account',
        'cashAccount must be the depot reference account',
      );
    const base = {
      accountId: a.id,
      securityId: s.id,
      date: e.date,
      amountCents: e.amountCents,
      feeCents: e.feeCents,
      taxCents: e.taxCents,
      note: e.note ?? null,
      source: 'import' as const,
    };
    const inputs =
      e.tradeKind === 'reward'
        ? [
            { ...base, kind: 'dividend' as const, unitsE8: 0, importKey: `${e.importKey}:div` },
            { ...base, kind: 'buy' as const, unitsE8, importKey: `${e.importKey}:buy` },
          ]
        : [{ ...base, kind: e.tradeKind, unitsE8, importKey: e.importKey }];
    const results = inputs.map((input) => createTrade(tx, input, ctx));
    for (const [i, r] of results.entries()) {
      const input = inputs[i]!;
      if (
        r.duplicate &&
        ['securityId', 'date', 'kind', 'unitsE8', 'amountCents', 'feeCents', 'taxCents'].some(
          (k) => r.trade[k as keyof TradeRow] !== input[k as keyof typeof input],
        )
      )
        throw new EntrySkip('conflict', 'importKey already has different trade values');
    }
    if (
      e.tradeKind === 'reward' &&
      (results[0]!.duplicate !== results[1]!.duplicate ||
        Boolean(results[0]!.trade.deletedAt) !== Boolean(results[1]!.trade.deletedAt))
    )
      throw new EntrySkip('conflict', 'reward pair is incomplete');
    if (cash && !results[0]!.duplicate) {
      const input = tradeCashTransferInput(inputs[0]!, cash.id);
      if (input) {
        if (
          tx
            .select()
            .from(booking)
            .where(and(eq(booking.importKey, input.importKey!), eq(booking.accountId, a.id)))
            .get()
        )
          throw new EntrySkip('conflict', 'settlement transfer key already exists');
        createTransfer(tx, input, ctx);
      }
    }
    return {
      status: results.every((r) => r.duplicate) ? 'unchanged' : 'added',
      units: e.units,
      amountCents: e.amountCents,
      affectedAccounts: [a.name, ...(cash ? [cash.name] : [])],
    };
  }
  const candidates = listTrades(tx, {
    accountId: a.id,
    securityId: s.id,
    from: m.date,
    to: m.date,
  }).filter(
    (t) =>
      t.kind === (m.tradeKind === 'reward' ? 'buy' : m.tradeKind) &&
      (m.tradeKind !== 'reward' || t.importKey?.endsWith(':buy')) &&
      (m.units === undefined || t.unitsE8 === parseScaledDecimal(m.units, 8)) &&
      (m.amountCents === undefined || t.amountCents === m.amountCents),
  );
  const t = one(candidates, 'not_found');
  const targets = m.tradeKind === 'reward' ? [rewardDividend(tx, t), t] : [t];
  const affectedAccounts = [a.name];
  for (const target of targets) {
    if (target.importKey) {
      const legs = tx
        .select()
        .from(booking)
        .where(
          and(
            eq(booking.accountId, a.id),
            eq(booking.importKey, `${target.importKey}:cash`),
            isNull(booking.deletedAt),
          ),
        )
        .all();
      if (legs.length > 1) throw new EntrySkip('ambiguous', 'multiple settlement transfers');
      if (legs[0]) {
        if (!legs[0].transferId)
          throw new EntrySkip('conflict', 'settlement key is not a transfer');
        for (const leg of tx
          .select()
          .from(booking)
          .where(and(eq(booking.transferId, legs[0].transferId), isNull(booking.deletedAt)))
          .all()) {
          const owner = one(
            tx.select().from(account).where(eq(account.id, leg.accountId)).all(),
            'unknown_account',
          );
          if (owner.closedAt || owner.deletedAt)
            throw new EntrySkip('closed_account', 'transfer account is closed or deleted');
          affectedAccounts.push(owner.name);
        }
        deleteBooking(tx, legs[0].id, ctx);
      }
    }
    deleteTrade(tx, target.id, ctx);
  }
  return {
    status: 'deleted',
    units: formatOwnerTradeUnits(BigInt(t.unitsE8)),
    amountCents: t.amountCents,
    affectedAccounts,
  };
}
function formatOwnerTradeUnits(v: bigint): string {
  const abs = v < 0n ? -v : v;
  const fraction = (abs % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${v < 0n ? '-' : ''}${abs / 100_000_000n}${fraction ? `.${fraction}` : ''}`;
}
function snapshot(tx: Executor) {
  const cash = new Map(
    accountSummaries(tx, '9999-12-31').map((a) => [
      a.id,
      { account: a.name, balance: BigInt(a.balanceCents) },
    ]),
  );
  const units = new Map<string, bigint>();
  for (const t of listTrades(tx))
    units.set(t.securityId, (units.get(t.securityId) ?? 0n) + BigInt(t.unitsE8));
  return { cash, units };
}
/** One run group, one savepoint per entry; a dry run exercises all writes then rolls back. */
export function applyOwnerTrades(
  db: Executor,
  file: OwnerTradesFile,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean } = {},
) {
  const outcomes: OwnerTradeOutcome[] = [];
  const cashChanges: { account: string; cents: string }[] = [];
  const unitChanges: { security: string; units: string }[] = [];
  try {
    runInTransaction(db, (tx) => {
      const before = snapshot(tx);
      const grouped = { actor: ctx.actor, groupId: randomUUID() };
      for (const e of file.trades) {
        const m = e.kind === 'add' ? e : e.match;
        try {
          const result = runInTransaction(tx, (inner) => applyEntry(inner, e, grouped));
          outcomes.push({
            ...m,
            ...result,
            id: e.id,
            reason: '',
            detail: '',
            groupId: result.status === 'unchanged' ? '' : grouped.groupId,
          });
        } catch (error) {
          outcomes.push({
            ...m,
            id: e.id,
            status: 'skipped',
            reason:
              error instanceof EntrySkip
                ? error.reason
                : error instanceof ReconciledLockedError
                  ? 'reconciled_locked'
                  : error instanceof RangeError
                    ? 'refused_by_rules'
                    : 'refused',
            detail: error instanceof Error ? error.message : 'failed',
            groupId: '',
          });
        }
      }
      const after = snapshot(tx);
      for (const [id, row] of after.cash) {
        const delta = row.balance - before.cash.get(id)!.balance;
        if (
          delta ||
          outcomes.some((o) => o.affectedAccounts?.some((name) => fold(name) === fold(row.account)))
        )
          cashChanges.push({ account: row.account, cents: delta.toString() });
      }
      for (const s of tx.select().from(security).where(isNull(security.deletedAt)).all()) {
        const delta = (after.units.get(s.id) ?? 0n) - (before.units.get(s.id) ?? 0n);
        if (
          delta ||
          outcomes.some(
            (o) =>
              o.status !== 'skipped' &&
              (o.isin === s.isin || (o.security && fold(o.security) === fold(s.name))),
          )
        )
          unitChanges.push({ security: s.name, units: formatOwnerTradeUnits(delta) });
      }
      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
    for (const o of outcomes) o.groupId = '';
  }
  const count = (status: OwnerTradeOutcome['status']) =>
    outcomes.filter((o) => o.status === status).length;
  return {
    outcomes,
    counts: {
      added: count('added'),
      unchanged: count('unchanged'),
      deleted: count('deleted'),
      skipped: count('skipped'),
    },
    cashChanges,
    unitChanges,
  };
}
