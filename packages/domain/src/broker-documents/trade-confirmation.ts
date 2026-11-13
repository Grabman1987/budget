import { parseAmount } from '../money/parse';

/**
 * Deterministic reader for a one-page broker trade confirmation ("Wertpapierabrechnung"), as
 * extracted from a text PDF (#1057, step 1). Conservative contract, like the card statement
 * reader: every printed figure is read as printed, cross-checked, and any gap, inconsistency or
 * unknown table line adds a reason and clears `verified`. Nothing is guessed or repaired.
 *
 * Text extraction may put a label and its value on one line or on adjacent lines and may vary
 * spacing, so the text is flattened to single spaces and read by labels, never by offsets.
 * Account identifiers never leave the reader in full: only the last four characters are kept.
 */

export const TRADE_CONFIRMATION_PARSER_VERSION = 1;
/** A one-page confirmation is a few thousand characters; anything far longer is not this layout. */
export const TRADE_CONFIRMATION_MAX_TEXT = 20_000;

export type TradeConfirmationKind = 'savings_plan' | 'round_up' | 'buy' | 'sell';
export type TradeConfirmationCostKind = 'fee' | 'tax' | 'unknown';
export type TradeConfirmationCost = {
  label: string;
  kind: TradeConfirmationCostKind;
  /** Signed as printed: negative reduces the cash balance (a buy's fee, a sale's withheld tax). */
  cents: number;
};
export type TradeConfirmation = {
  parserVersion: typeof TRADE_CONFIRMATION_PARSER_VERSION;
  sha256: string;
  kind: TradeConfirmationKind | null;
  /** Printed document date (header), ISO. */
  documentDate: string | null;
  /** Execution day from the overview sentence, ISO. */
  executionDate: string | null;
  /** Execution time `HH:MM` when printed (orders only). */
  executionTime: string | null;
  executionId: string | null;
  planId: string | null;
  orderId: string | null;
  /** Last four characters of the printed depot number. */
  depotHint: string | null;
  venue: string | null;
  instrument: { name: string; isin: string } | null;
  /** Exact decimal string with a decimal point (`0.339443`); always positive. */
  quantity: string | null;
  /** The quantity in the portfolio's 1e-8 units, when it fits exactly. */
  unitsE8: number | null;
  /** Printed average price as an exact decimal string with a decimal point. */
  price: { value: string; currency: string } | null;
  /** Gross position value, positive cents. */
  amountCents: number | null;
  costs: TradeConfirmationCost[];
  /** Cash moved by the trade, positive cents (position amount with costs applied). */
  totalCents: number | null;
  booking: {
    /** Last four characters of the settlement account IBAN. */
    accountHint: string;
    valueDate: string;
    /** Negative = cash out (buy), positive = cash in (sell). */
    signedCents: number;
  } | null;
  currency: string | null;
  verified: boolean;
  reasons: string[];
};

const AMOUNT = String.raw`[-−]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;
const DECIMAL = String.raw`(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?`;
const DATE = String.raw`\d{2}\.\d{2}\.\d{4}`;
const ID = String.raw`(?=[A-Za-z-]*\d)[0-9A-Za-z](?:[0-9A-Za-z-]{2,62}[0-9A-Za-z])`;
const CURRENCY = '[A-Z]{3}';
const TABLE_HEADER = 'POSITION ANZAHL DURCHSCHNITTSKURS BETRAG';
const COSTS_HEADER = 'ABRECHNUNG POSITION BETRAG';
const BOOKING_HEADER = 'BUCHUNG VERRECHNUNGSKONTO WERTSTELLUNG BETRAG';
/** The overview sentence ends before the counterparty sentence or the position table. */
const SENTENCE_END = String.raw`\.(?= Der Kontrahent\b| ${TABLE_HEADER}| ÜBERSICHT\b|$)`;

const FEE_LABELS = new Set(['fremdkostenzuschlag', 'ordergebühr']);
const TAX_LABELS = new Set([
  'kapitalertragsteuer',
  'kapitalertragssteuer',
  'solidaritätszuschlag',
  'kirchensteuer',
  'quellensteuer',
]);

const flatten = (text: string) =>
  text
    .normalize('NFC')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

const isoFromDeAt = (raw: string) => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
  return match ? calendarDay(`${match[3]}-${match[2]}-${match[1]}`) : null;
};
const calendarDay = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
};
/** A de-AT amount matched by `AMOUNT`, through the domain amount parser. */
const printedCents = (raw: string): number | null => {
  if (!new RegExp(`^${AMOUNT}$`).test(raw)) return null;
  const parsed = parseAmount(raw);
  return parsed.ok ? parsed.cents : null;
};
/** `1.234,5678` to `1234.5678`; the input is already matched by `DECIMAL`. */
const decimalString = (raw: string) => raw.replace(/\./g, '').replace(',', '.');
const scaled = (value: string) => {
  const [whole = '0', fraction = ''] = value.split('.');
  return { digits: BigInt(whole + fraction), scale: fraction.length };
};

/** ISO 6166: letters to numbers (A = 10), Luhn over the digit string including the check digit. */
export function isinCheckDigitValid(isin: string): boolean {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join('');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Quantity × average price against the printed amount. The average price is itself printed
 * rounded, so the tolerance is one cent or, when larger, the amount's half cent plus the price
 * rounding (half a unit of its last printed digit) times the quantity. Exact integer arithmetic.
 */
export function tradeValueConsistent(quantity: string, price: string, amountCents: number) {
  const q = scaled(quantity),
    p = scaled(price);
  const unit = 10n ** BigInt(q.scale + p.scale); // one cent in the comparison scale
  const diff = q.digits * p.digits * 100n - BigInt(amountCents) * unit;
  const twiceDiff = 2n * (diff < 0n ? -diff : diff);
  const rounding = unit + 100n * q.digits; // 2 × (half cent + quantity × half price unit)
  return twiceDiff <= (rounding > 2n * unit ? rounding : 2n * unit);
}

/** Cheap, bounded signature check for the document classifier. */
export function acceptsTradeConfirmation(text: string): boolean {
  if (text.length > TRADE_CONFIRMATION_MAX_TEXT) return false;
  const flat = flatten(text);
  return (
    /\bWERTPAPIERABRECHNUNG\b/.test(flat) &&
    flat.includes(TABLE_HEADER) &&
    flat.includes(BOOKING_HEADER) &&
    /\bISIN: ?[A-Z]{2}[A-Z0-9]{9}\d\b/.test(flat)
  );
}

const unique = (flat: string, pattern: string) => {
  const all = [...flat.matchAll(new RegExp(pattern, 'g'))];
  return { match: all.length === 1 ? all[0]! : null, count: all.length };
};

export function parseTradeConfirmation(text: string, sha256: string): TradeConfirmation {
  const doc: TradeConfirmation = {
    parserVersion: TRADE_CONFIRMATION_PARSER_VERSION,
    sha256,
    kind: null,
    documentDate: null,
    executionDate: null,
    executionTime: null,
    executionId: null,
    planId: null,
    orderId: null,
    depotHint: null,
    venue: null,
    instrument: null,
    quantity: null,
    unitsE8: null,
    price: null,
    amountCents: null,
    costs: [],
    totalCents: null,
    booking: null,
    currency: null,
    verified: false,
    reasons: [],
  };
  const issue = (reason: string) => {
    if (!doc.reasons.includes(reason)) doc.reasons.push(reason);
  };
  if (!/^[a-f0-9]{64}$/.test(sha256)) issue('source_hash_invalid');
  if (!acceptsTradeConfirmation(text)) {
    issue(text.length > TRADE_CONFIRMATION_MAX_TEXT ? 'text_too_long' : 'layout_unavailable');
    return doc;
  }
  const flat = flatten(text);
  const currencies = new Set<string>();

  // Header block: label/value pairs; each label must be printed exactly once.
  const header = (label: string, value: string, required: boolean) => {
    const { match, count } = unique(flat, String.raw`\b${label} (${value})(?= |$)`);
    if (count > 1) issue(`header_${label.toLowerCase()}_ambiguous`);
    else if (!match && required) issue(`header_${label.toLowerCase()}_missing`);
    return match?.[1] ?? null;
  };
  const printedDate = header('DATUM', DATE, true);
  doc.documentDate = printedDate ? isoFromDeAt(printedDate) : null;
  if (printedDate && !doc.documentDate) issue('header_datum_invalid');
  doc.executionId = header('AUSFÜHRUNG', ID, true);
  doc.planId = header('SPARPLAN', ID, false);
  doc.orderId = header('ORDER', ID, false);
  const depot = header('DEPOT', '[0-9A-Z]{4,34}', true);
  doc.depotHint = depot ? depot.slice(-4) : null;

  // Title; "SPARPLAN <id>" is the header field, not the title suffix.
  const titles = [
    ...flat.matchAll(new RegExp(String.raw`\bWERTPAPIERABRECHNUNG( SPARPLAN(?! ${ID}))?\b`, 'g')),
  ];
  if (titles.length !== 1) issue('title_unavailable');
  const savingsTitle = titles.length === 1 && Boolean(titles[0]![1]);

  // Overview sentence: execution kind, day and venue.
  const sentences: {
    kind: TradeConfirmationKind;
    date: string;
    time: string | null;
    venue: string;
  }[] = [];
  for (const m of flat.matchAll(
    new RegExp(
      String.raw`\bSparplanausführung am (${DATE}) an der (.{1,120}?)${SENTENCE_END}`,
      'g',
    ),
  ))
    sentences.push({ kind: 'savings_plan', date: m[1]!, time: null, venue: m[2]! });
  for (const m of flat.matchAll(
    new RegExp(
      String.raw`\bAusführung von Round up am (${DATE}) an der (.{1,120}?)${SENTENCE_END}`,
      'g',
    ),
  ))
    sentences.push({ kind: 'round_up', date: m[1]!, time: null, venue: m[2]! });
  // Not verified against a sample: the wording of a normal buy or sell order is assumed.
  for (const m of flat.matchAll(
    new RegExp(
      String.raw`\b(?:Market|Limit)-Order (Kauf|Verkauf) am (${DATE}), um (\d{2}:\d{2}) Uhr an der (.{1,120}?)${SENTENCE_END}`,
      'g',
    ),
  ))
    sentences.push({
      kind: m[1] === 'Kauf' ? 'buy' : 'sell',
      date: m[2]!,
      time: m[3]!,
      venue: m[4]!,
    });
  if (sentences.length !== 1) issue('execution_sentence_unavailable');
  else {
    const s = sentences[0]!;
    doc.kind = s.kind;
    doc.venue = s.venue;
    doc.executionDate = isoFromDeAt(s.date);
    if (!doc.executionDate) issue('execution_date_invalid');
    if (s.time) {
      const [h, min] = s.time.split(':').map(Number);
      if (h! > 23 || min! > 59) issue('execution_time_invalid');
      else doc.executionTime = s.time;
    }
    if ((s.kind === 'savings_plan') !== savingsTitle) issue('title_kind_mismatch');
    if (s.kind === 'savings_plan' && !doc.planId) issue('plan_id_missing');
    if (s.kind !== 'savings_plan' && doc.planId) issue('plan_id_unexpected');
  }

  // Position table: exactly one row with its ISIN line, then the position total.
  const tableAt = flat.indexOf(TABLE_HEADER);
  if (flat.indexOf(TABLE_HEADER, tableAt + 1) !== -1) issue('position_table_ambiguous');
  const afterTable = flat.slice(tableAt + TABLE_HEADER.length);
  const totalAt = afterTable.indexOf(' GESAMT ');
  let rest = '';
  if (totalAt < 0) issue('position_total_missing');
  else {
    const rows = afterTable.slice(0, totalAt).trim();
    const row =
      rows.length <= 400
        ? new RegExp(
            String.raw`^(.{1,160}?) (${DECIMAL}) Stk\. (${DECIMAL}) (${CURRENCY}) (${AMOUNT}) (${CURRENCY}) ISIN: ?([A-Z]{2}[A-Z0-9]{9}\d)$`,
          ).exec(rows)
        : null;
    // A name that swallowed another row (its quantity or amount) means more than one row.
    if (!row || new RegExp(String.raw`\bStk\.|\bISIN:|${AMOUNT} ${CURRENCY}\b`).test(row[1]!))
      issue('unrecognized_position_row');
    else {
      const [, name, qty, price, priceCurrency, amount, currency, isin] =
        row as unknown as string[];
      doc.instrument = { name: name!, isin: isin! };
      if (!isinCheckDigitValid(isin!)) issue('isin_check_digit_invalid');
      doc.quantity = decimalString(qty!);
      const q = scaled(doc.quantity);
      if (q.scale <= 8) {
        const units = q.digits * 10n ** BigInt(8 - q.scale);
        doc.unitsE8 = units <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(units) : null;
      }
      if (doc.unitsE8 === null) issue('quantity_precision_unavailable');
      doc.price = { value: decimalString(price!), currency: priceCurrency! };
      doc.amountCents = printedCents(amount!);
      currencies.add(currency!);
      if (doc.amountCents === null || doc.amountCents <= 0) issue('position_amount_invalid');
      if (q.digits === 0n || scaled(doc.price.value).digits === 0n) issue('quantity_or_price_zero');
      if (priceCurrency !== currency) issue('price_currency_differs');
      else if (
        doc.amountCents !== null &&
        !tradeValueConsistent(doc.quantity, doc.price.value, doc.amountCents)
      )
        issue('quantity_price_amount_mismatch');
    }
    const total = new RegExp(`^ GESAMT (${AMOUNT}) (${CURRENCY})(?: |$)`).exec(
      afterTable.slice(totalAt),
    );
    if (!total) issue('position_total_missing');
    else {
      currencies.add(total[2]!);
      if (printedCents(total[1]!) !== doc.amountCents) issue('position_total_mismatch');
      rest = afterTable.slice(totalAt + total[0].length).trim();
    }
  }

  // Optional cost/tax table, then the booking table must follow directly.
  let costsTotal: number | null = null;
  if (rest.startsWith(COSTS_HEADER)) {
    const body = rest.slice(COSTS_HEADER.length);
    const end = body.indexOf(' GESAMT ');
    const lines = end < 0 ? '' : body.slice(0, end).trim();
    const total =
      end < 0
        ? null
        : new RegExp(`^ GESAMT (${AMOUNT}) (${CURRENCY})(?: |$)`).exec(body.slice(end));
    if (!total || lines.length > 1000) {
      issue('cost_table_unavailable');
      rest = '';
    } else {
      currencies.add(total[2]!);
      costsTotal = printedCents(total[1]!);
      const item = new RegExp(
        String.raw`([^\d\s−-][^\d−]{0,79}?) (${AMOUNT}) (${CURRENCY})(?: |$)`,
        'y',
      );
      let at = 0;
      while (at < lines.length) {
        item.lastIndex = at;
        const m = item.exec(lines);
        const cents = m ? printedCents(m[2]!) : null;
        if (!m || cents === null) {
          issue('unrecognized_cost_line');
          break;
        }
        const label = m[1]!.trim();
        const plain = label.toLocaleLowerCase('de-AT');
        const kind = FEE_LABELS.has(plain) ? 'fee' : TAX_LABELS.has(plain) ? 'tax' : 'unknown';
        if (kind === 'unknown') issue('unknown_cost_line');
        currencies.add(m[3]!);
        doc.costs.push({ label, kind, cents });
        at = item.lastIndex;
      }
      rest = body.slice(end + total[0].length).trim();
    }
  }
  if (!rest.startsWith(BOOKING_HEADER)) issue(rest ? 'unrecognized_table_line' : 'booking_missing');
  else {
    const body = rest.slice(BOOKING_HEADER.length).trim();
    const row = new RegExp(
      String.raw`^([A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}) (\d{4}-\d{2}-\d{2}) (${AMOUNT}) (${CURRENCY})(?: |$)`,
    ).exec(body);
    const signedCents = row ? printedCents(row[3]!) : null;
    const valueDate = row ? calendarDay(row[2]!) : null;
    if (!row || signedCents === null || !valueDate) issue('booking_row_unavailable');
    else {
      const iban = row[1]!.replace(/ /g, '');
      doc.booking = { accountHint: iban.slice(-4), valueDate, signedCents };
      currencies.add(row[4]!);
      if (
        new RegExp(String.raw`\d{4}-\d{2}-\d{2} ${AMOUNT} ${CURRENCY}\b`).test(
          body.slice(row[0].length),
        )
      )
        issue('booking_ambiguous');
      if (doc.executionDate && valueDate < doc.executionDate) issue('value_date_before_execution');
    }
  }

  // Cross-checks: costs applied to the position must give the booked cash movement.
  if (currencies.size > 1) issue('currency_mixed');
  doc.currency = currencies.size === 1 ? [...currencies][0]! : null;
  if (doc.kind && doc.amountCents !== null) {
    const costs = doc.costs.reduce((sum, c) => sum + c.cents, 0);
    const net = (doc.kind === 'sell' ? doc.amountCents : -doc.amountCents) + costs;
    doc.totalCents = Math.abs(net);
    // Not verified against a sample: the cost table total may be printed as the settlement
    // total or as the sum of the cost lines; both are accepted, anything else is a reason.
    if (costsTotal !== null && costsTotal !== net && costsTotal !== costs)
      issue('cost_total_mismatch');
    if (doc.kind === 'sell' ? net <= 0 : net >= 0) issue('settlement_sign_mismatch');
    if (doc.booking && doc.booking.signedCents !== net) issue('booking_total_mismatch');
  }
  doc.verified = doc.reasons.length === 0;
  return doc;
}
