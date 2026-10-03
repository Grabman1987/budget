import {
  formatDecimal,
  moneyRuleViolation,
  parseAmount,
  parseScaledDecimal,
  settlementCents,
  unitsRuleViolation,
  type Cents,
} from '@budget/domain';
import { unitsText } from './portfolio-format';
import type { ManualTrade, TradeRow } from './trade-api';
export type TradeDraft = {
  accountId: string;
  securityId: string;
  date: string;
  kind: ManualTrade['kind'];
  units: string;
  amount: string;
  fee: string;
  tax: string;
  note: string;
};
export type TradeErrors = Partial<Record<keyof TradeDraft | 'form', string>>;
export const tradeDraft = (
  date: string,
  securityId = '',
  accountId = '',
  trade?: TradeRow,
): TradeDraft => ({
  accountId: trade?.accountId ?? accountId,
  securityId: trade?.securityId ?? securityId,
  date: trade?.date ?? date,
  kind: trade?.kind ?? 'buy',
  units: trade
    ? unitsText(trade.kind === 'split' ? trade.unitsE8 : Math.abs(trade.unitsE8))
        .replaceAll('.', '')
        .replace('−', '-')
    : '',
  amount: trade ? formatDecimal(trade.amountCents as Cents) : '',
  fee: formatDecimal((trade?.feeCents ?? 0) as Cents),
  tax: formatDecimal((trade?.taxCents ?? 0) as Cents),
  note: trade?.note ?? '',
});
/** Entry validation only; settlement and all analytics use shared domain rules. */
export function validateTrade(draft: TradeDraft): {
  errors: TradeErrors;
  values?: ManualTrade;
  settlement?: number;
} {
  const errors: TradeErrors = {};
  if (!draft.accountId) errors.accountId = 'Anlagekonto auswählen.';
  if (!draft.securityId) errors.securityId = 'Instrument auswählen.';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    !Number.isFinite(Date.parse(draft.date)) ||
    new Date(draft.date).toISOString().slice(0, 10) !== draft.date
  )
    errors.date = 'Gültiges Handelsdatum eingeben.';
  let units = 0;
  const normalized = draft.units.trim().replace(',', '.').replace('−', '-');
  const decimal = draft.kind === 'split' ? normalized.replace(/^\+/, '') : normalized;
  try {
    if (!hasUnits(draft.kind)) units = 0;
    else {
      if (!(draft.kind === 'split' ? /^-?\d+(\.\d{1,8})?$/ : /^\d+(\.\d{1,8})?$/).test(decimal))
        throw new RangeError();
      units = parseScaledDecimal(decimal, 8);
      if (draft.kind === 'split' ? units === 0 : units <= 0) throw new RangeError();
    }
  } catch {
    errors.units =
      draft.kind === 'split'
        ? 'Stückänderung ungleich 0 mit höchstens acht Nachkommastellen eingeben.'
        : 'Positive Stückzahl mit höchstens acht Nachkommastellen eingeben.';
  }
  const money = { amount: 0, fee: 0, tax: 0 };
  for (const key of ['amount', 'fee', 'tax'] as const) {
    const result = parseAmount(draft[key]);
    if (!result.ok || result.cents < 0) errors[key] = 'Betrag ab 0 eingeben.';
    else money[key] = result.cents;
  }
  const values: ManualTrade = {
    accountId: draft.accountId,
    securityId: draft.securityId,
    date: draft.date,
    kind: draft.kind,
    unitsE8: draft.kind === 'sell' || draft.kind === 'delivery_out' ? -units : units,
    amountCents: money.amount,
    feeCents: money.fee,
    taxCents: money.tax,
    note: draft.note.trim() || null,
  };
  if (moneyRuleViolation(values))
    errors.form =
      draft.kind === 'buy'
        ? 'Ein Kauf hat keine einbehaltene Steuer.'
        : hasDeductions(draft.kind)
          ? 'Gebühren und einbehaltene Steuer dürfen den Bruttobetrag nicht überschreiten.'
          : 'Diese Handelsart hat keine separaten Gebühren oder Steuern.';
  if (unitsRuleViolation(values.kind, values.unitsE8) && !errors.units)
    errors.units = 'Stückzahl passt nicht zur Handelsart.';
  if (draft.kind === 'split' && values.amountCents !== 0)
    errors.amount = 'Ein Aktiensplit hat keinen Geldbetrag.';
  const settlement = settlementCents(values);
  if (!Number.isSafeInteger(settlement)) errors.form = 'Gesamtbetrag ist zu groß.';
  return Object.keys(errors).length ? { errors } : { errors, values, settlement };
}
export const hasUnits = (kind: ManualTrade['kind']) =>
  ['buy', 'sell', 'delivery_in', 'delivery_out', 'split'].includes(kind);
export const hasDeductions = (kind: ManualTrade['kind']) =>
  ['sell', 'dividend', 'interest'].includes(kind);
export const TRADE_LABELS: Record<ManualTrade['kind'], string> = {
  buy: 'Kauf',
  sell: 'Verkauf',
  dividend: 'Dividende / Ausschüttung',
  interest: 'Zinsen',
  fee: 'Gebühr',
  tax: 'Steuer',
  delivery_in: 'Einlieferung',
  delivery_out: 'Auslieferung',
  split: 'Aktiensplit',
};
