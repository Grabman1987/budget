import { referenceModel } from '../reference/model';
import { buildCashflow, mergeOnlineOrders, monthEnd, type Draft } from './cashflow';
import { coverageCases } from './coverage';
import { buildInvestments } from './investments';
import { ACC, masterData } from './master-data';
import { buildPlanning } from './planning';
import type { SampleLedger } from './types';

/** Balance of the current account at each month end after the monthly sweep (from the prototype's shape). */
const giroTarget = (k: number): number =>
  k === 35 ? 161700 : Math.round((1450 + 260 * Math.sin(k * 1.7)) * 100);
const OPENING_GIRO = 145000;

let cached: SampleLedger | undefined;

/** The complete synthetic sample ledger (deterministic, memoised). */
export function sampleLedger(): SampleLedger {
  cached ??= build();
  return cached;
}

function build(): SampleLedger {
  const ref = referenceModel();
  const master = masterData();
  const cash = buildCashflow();
  let drafts: Draft[] = mergeOnlineOrders(cash.drafts);
  let seq = drafts.reduce((a, d) => Math.max(a, d.seq), 0) + 1;
  const invest = buildInvestments(cash.contributions, seq);
  seq += invest.buyDrafts.length;
  drafts = drafts.concat(invest.buyDrafts);
  const coverage = coverageCases(drafts, invest, seq);
  seq += coverage.drafts.length;
  drafts = drafts.concat(coverage.drafts);
  invest.trades.push(...coverage.trades);

  // ---------- Monthly sweep: keep the current account at its target, the rest lives on the savings account ----------
  const giroFlows = drafts
    .filter((d) => d.accountId === ACC.giro && !d.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
  let balance = OPENING_GIRO;
  let cursor = 0;
  let transferNo = drafts.filter((d) => d.transferKey).length;
  for (const m of ref.months) {
    const end = monthEnd(m);
    while (cursor < giroFlows.length && (giroFlows[cursor] as Draft).date <= end) {
      balance += (giroFlows[cursor] as Draft).amountCents;
      cursor++;
    }
    const sweep = balance - giroTarget(m.k);
    if (sweep === 0) continue;
    const key = `sweep${transferNo++}`;
    const [from, to] = sweep > 0 ? [ACC.giro, ACC.tagesgeld] : [ACC.tagesgeld, ACC.giro];
    const amount = Math.abs(sweep);
    const memo = 'Übertrag Tagesgeld';
    drafts.push({
      seq: seq++,
      date: end,
      accountId: from,
      amountCents: -amount,
      memo,
      splits: [{ categoryId: null, amountCents: -amount }],
      transferKey: key,
    });
    drafts.push({
      seq: seq++,
      date: end,
      accountId: to,
      amountCents: amount,
      memo,
      splits: [{ categoryId: null, amountCents: amount }],
      transferKey: key,
    });
    balance -= sweep;
  }

  // ---------- Ids in chronological order ----------
  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
  const transfers: SampleLedger['transfers'] = [];
  const transferIds = new Map<string, string>();
  const bookings: SampleLedger['bookings'] = [];
  const splits: SampleLedger['splits'] = [];
  const bookingOfTrade = new Map<string, string>();
  drafts.forEach((d, i) => {
    const id = `bk-${String(i + 1).padStart(6, '0')}`;
    let transferId: string | undefined;
    if (d.transferKey) {
      transferId = transferIds.get(d.transferKey);
      if (!transferId) {
        transferId = `tr-${String(transferIds.size + 1).padStart(5, '0')}`;
        transferIds.set(d.transferKey, transferId);
        transfers.push({ id: transferId });
      }
    }
    if (d.tradeKey) bookingOfTrade.set(d.tradeKey, id);
    bookings.push({
      id,
      accountId: d.accountId,
      date: d.date,
      amountCents: d.amountCents,
      ...(d.payeeId ? { payeeId: d.payeeId } : {}),
      ...(d.memo ? { memo: d.memo } : {}),
      status:
        d.date >= '2026-09-15' ? 'pending' : d.date >= '2026-09-01' ? 'confirmed' : 'reconciled',
      ...(transferId ? { transferId } : {}),
      ...(d.original
        ? {
            originalAmountCents: d.original.cents,
            originalCurrency: d.original.currency,
            fxRateMicro: d.original.rateMicro,
            // The bank's deviation from the ECB conversion (C7: amount = original × rate + fee).
            fxFeeCents: d.amountCents - Math.round((d.original.cents * d.original.rateMicro) / 1e6),
          }
        : {}),
      ...(d.projectId ? { projectId: d.projectId } : {}),
      ...(d.currency ? { currency: d.currency } : {}),
      ...(d.deletedAt ? { deletedAt: d.deletedAt } : {}),
      source: 'migration',
      importKey: `sample-${id}`,
    });
    d.splits.forEach((s, n) =>
      splits.push({
        id: `${id}-s${n + 1}`,
        bookingId: id,
        categoryId: s.categoryId,
        amountCents: s.amountCents,
        ...(s.memo ? { memo: s.memo } : {}),
        ...(s.incomeTypeId ? { incomeTypeId: s.incomeTypeId } : {}),
        sortOrder: n,
      }),
    );
  });
  const trades = invest.trades.map((t) => ({
    ...t,
    bookingId: bookingOfTrade.get(t.importKey?.replace('sample-trade-', '') ?? '') ?? null,
  }));

  // ---------- Opening balances ----------
  const sumOn = (accountId: string) =>
    bookings
      .filter((b) => b.accountId === accountId && !b.deletedAt)
      .reduce((a, b) => a + b.amountCents, 0);
  const holdingsValue = Object.values(invest.finalValueCents).reduce((a, b) => a + b, 0);
  const finalCards = sumOn(ACC.karte);
  // Loan: the balance today is -12.176,00 €.
  const openingKredit = -Math.round(12176 * 100) - sumOn(ACC.kredit);
  // Net worth today is exactly 84.730,00 €: the savings account opening balance is the residual.
  const openingTagesgeld =
    8473000 -
    (161700 +
      finalCards +
      (openingKredit + sumOn(ACC.kredit)) +
      holdingsValue +
      sumOn(ACC.tagesgeld) +
      sumOn(ACC.depot) +
      sumOn(ACC.krypto) +
      sumOn(ACC.p2p));
  const openings: Record<string, number> = {
    [ACC.giro]: OPENING_GIRO,
    [ACC.tagesgeld]: openingTagesgeld,
    [ACC.kredit]: openingKredit,
  };
  const accounts = master.accounts.map((a) => ({ ...a, openingBalanceCents: openings[a.id] ?? 0 }));

  const planning = buildPlanning();

  return {
    ...master,
    accounts,
    transfers,
    bookings,
    splits,
    holdings: invest.holdings,
    trades,
    prices: invest.prices,
    ...planning,
  };
}
