import type { TradeConfirmation, TradeConfirmationKind } from './trade-confirmation';

/**
 * Trade form proposal from a read broker trade confirmation (#1099). Pure mapping, no repair:
 * a value is offered only when the reader printed it and no cross-check that concerns it failed.
 * Every other field stays `null` and is listed in `open`, so the form leaves it empty and names
 * it. A reason this mapping does not know clears every field (fail-safe for new reader reasons).
 */

export type TradeProposalField =
  'kind' | 'instrument' | 'date' | 'units' | 'amount' | 'fee' | 'tax';

export type ConfirmationTradeProposal = {
  /**
   * Stable identity of the confirmation for duplicate detection: the printed execution id, or the
   * file hash when the id was not read.
   */
  reference: string;
  /** What the document says it is; a savings plan execution and a round up are both buys. */
  source: TradeConfirmationKind | null;
  kind: 'buy' | 'sell' | null;
  instrument: { name: string; isin: string } | null;
  /** Execution day, ISO. */
  date: string | null;
  /** Positive quantity in 1e-8 units. */
  unitsE8: number | null;
  /** Gross position value, positive cents. */
  amountCents: number | null;
  /** Sum of the printed fee lines, positive cents; 0 when the document prints no cost table. */
  feeCents: number | null;
  /** Sum of the printed withheld tax lines, positive cents; 0 without a cost table. */
  taxCents: number | null;
  currency: string | null;
  /** Last four characters of the settlement account as printed; a hint for the owner only. */
  settlementHint: string | null;
  /** Fields without a value, in form order. */
  open: TradeProposalField[];
  /**
   * Quantity and amount are as printed, but the printed average price is too coarse to confirm
   * quantity × price against the amount.
   */
  unchecked: boolean;
};

/** What the central upload hands to the trade form. */
export type TradeConfirmationIntake = {
  proposal: ConfirmationTradeProposal;
  /** The one live instrument with the printed ISIN, else `null`. */
  securityId: string | null;
  /** Idempotency key for the trade write. */
  importKey: string;
  /** A live trade that already records this confirmation. */
  duplicate: { tradeId: string; securityId: string; date: string } | null;
};

const FIELDS: readonly TradeProposalField[] = [
  'kind',
  'instrument',
  'date',
  'units',
  'amount',
  'fee',
  'tax',
];
const COSTS: readonly TradeProposalField[] = ['fee', 'tax'];
const MONEY: readonly TradeProposalField[] = ['amount', 'fee', 'tax'];
const POSITION: readonly TradeProposalField[] = ['instrument', 'units', 'amount'];

/** Reader reasons and the proposal fields they make unreliable. */
const CLEARS: Record<string, readonly TradeProposalField[]> = {
  // Identity and document facts the trade form does not carry.
  source_hash_invalid: [],
  plan_id_missing: [],
  plan_id_unexpected: [],
  execution_time_invalid: [],
  // Reported through `unchecked`; the printed values stay.
  price_precision_insufficient: [],
  title_unavailable: ['kind'],
  title_kind_mismatch: ['kind'],
  execution_sentence_unavailable: ['kind', 'date'],
  execution_date_invalid: ['date'],
  value_date_before_execution: ['date'],
  isin_check_digit_invalid: ['instrument'],
  unrecognized_position_row: POSITION,
  position_table_ambiguous: POSITION,
  quantity_precision_unavailable: ['units'],
  quantity_or_price_zero: ['units', 'amount'],
  quantity_price_amount_mismatch: ['units', 'amount'],
  position_amount_invalid: ['amount'],
  position_total_missing: ['amount'],
  position_total_mismatch: ['amount'],
  price_currency_differs: ['amount'],
  currency_mixed: MONEY,
  // Without a readable cost table or the booked total the costs cannot be confirmed.
  cost_table_unavailable: COSTS,
  unrecognized_cost_line: COSTS,
  unknown_cost_line: COSTS,
  cost_total_mismatch: COSTS,
  cost_sign_implausible: COSTS,
  unrecognized_table_line: COSTS,
  booking_missing: COSTS,
  booking_row_unavailable: COSTS,
  booking_ambiguous: COSTS,
  booking_total_mismatch: MONEY,
  settlement_sign_mismatch: ['kind', ...MONEY],
  amount_unsafe: MONEY,
};

export function tradeProposalFromConfirmation(doc: TradeConfirmation): ConfirmationTradeProposal {
  let feeCents: number | null = 0;
  let taxCents: number | null = 0;
  for (const cost of doc.costs) {
    // Printed costs are negative (they reduce cash); the form takes positive deductions.
    if (cost.kind === 'fee' && feeCents !== null) feeCents -= cost.cents;
    else if (cost.kind === 'tax' && taxCents !== null) taxCents -= cost.cents;
  }
  // A net refund has no place in the form; it stays open instead of being netted or dropped.
  if (feeCents !== null && (feeCents < 0 || !Number.isSafeInteger(feeCents))) feeCents = null;
  if (taxCents !== null && (taxCents < 0 || !Number.isSafeInteger(taxCents))) taxCents = null;
  // Without the booked total, or when the settlement cross-check never ran, nothing confirms
  // that the printed costs are complete.
  if (!doc.booking || doc.totalCents === null) feeCents = taxCents = null;

  const value: {
    kind: 'buy' | 'sell' | null;
    instrument: { name: string; isin: string } | null;
    date: string | null;
    units: number | null;
    amount: number | null;
    fee: number | null;
    tax: number | null;
  } = {
    kind: doc.kind === null ? null : doc.kind === 'sell' ? 'sell' : 'buy',
    instrument: doc.instrument,
    date: doc.executionDate,
    units: doc.unitsE8 !== null && doc.unitsE8 > 0 ? doc.unitsE8 : null,
    amount: doc.amountCents !== null && doc.amountCents > 0 ? doc.amountCents : null,
    fee: feeCents,
    tax: taxCents,
  };
  for (const reason of doc.reasons) {
    const cleared = reason.startsWith('header_') ? [] : (CLEARS[reason] ?? FIELDS);
    for (const field of cleared) value[field] = null;
  }
  // Without the trade type, units and money cannot be told apart from the opposite trade: the
  // form must not show a default type next to filled figures.
  if (value.kind === null) value.units = value.amount = value.fee = value.tax = null;
  return {
    reference: doc.executionId ? `wpa:${doc.executionId}` : `wpa-sha256:${doc.sha256}`,
    source: doc.kind,
    kind: value.kind,
    instrument: value.instrument,
    date: value.date,
    unitsE8: value.units,
    amountCents: value.amount,
    feeCents: value.fee,
    taxCents: value.tax,
    currency: doc.currency,
    settlementHint: doc.booking?.accountHint ?? null,
    open: FIELDS.filter((field) => value[field] === null),
    unchecked:
      doc.reasons.includes('price_precision_insufficient') &&
      value.units !== null &&
      value.amount !== null,
  };
}
