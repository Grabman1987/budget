import { parseStatementText, type StatementProposal } from './statement-intake';
import { parseScaledDecimal } from './money/scaled';
import { mulDivRound } from './wealth/int';

export type CardLayout = 'issued_card' | 'company_card';
export type CardRowKind = 'purchase' | 'refund' | 'credit' | 'payment' | 'fee' | 'unknown';
export type CardDocumentIdentity = {
  kind: 'printed_reference' | 'issued_date';
  key: string;
  issueDate: string;
  reference: string | null;
};
export type CardBoundary = {
  intakeId: string;
  sha256: string;
  revision: string;
  accountId: string;
  mappingKey: string;
  currency: string;
  cardTokens: string[];
  issueDate: string;
  payableCents: number;
};
export type CardRow = {
  key: string;
  line: number;
  kind: CardRowKind;
  cardToken: string;
  cardHint: string;
  accountId: string | null;
  transactionDate: string | null;
  bookingDate: string | null;
  dateOrigin: 'printed' | 'statement_boundaries' | 'issue_date';
  description: string;
  currency: string;
  amountCents: number;
  rebate: null | {
    quantityMicro: number;
    unitNetPriceMicro: number;
    unitNetDiscountMicro: number;
    vatBp: number;
    originalGrossCents: number;
    chargedGrossCents: number;
    creditCents: number;
  };
};
export type CardDocument = {
  parserVersion: 1;
  sha256: string;
  accountId: string;
  layout: CardLayout | null;
  summary: StatementProposal;
  identity: CardDocumentIdentity | null;
  previous: CardBoundary | null;
  rows: CardRow[];
  totalsVerified: boolean;
  reasons: string[];
};
export type CardParseContext = {
  accountId: string;
  currency: string;
  mappingKey: string;
  mappedCardAccounts: Readonly<Record<string, string>>;
  previous?: CardBoundary | null;
  /** Server-only identity function; raw source tokens never leave this reader. */
  cardIdentity?: (raw: string) => { fingerprint: string; hint: string };
};

const safe = (value: number) => Number.isSafeInteger(value);
const day = (text: string) => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
};
const decimal = (raw: string, scale: number) => {
  const text = raw.trim().replace('−', '-');
  if (!/^[-+]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text)) return null;
  const fraction = text.split(',')[1] ?? '';
  if (fraction.length > scale) return null;
  try {
    return parseScaledDecimal(text.replace(/\./g, '').replace(',', '.'), scale);
  } catch {
    return null;
  }
};
const cents = (raw: string) =>
  /^[-−]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(raw.trim()) ? decimal(raw, 2) : null;
const signed = (raw: string) => {
  const match = /^(\d[\d.,]*)\s*([+−-])$/.exec(raw.trim());
  const value = match ? cents(match[1]!) : null;
  return value === null ? null : value === 0 ? 0 : match![2] === '+' ? value : -value;
};
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-AT');
const cardIdentity = (raw: string, context: CardParseContext) => {
  if (!raw.trim() || !context.cardIdentity) return { fingerprint: '', hint: 'Karte' };
  const result = context.cardIdentity(raw.trim());
  return /^[a-f0-9]{64}$/.test(result.fingerprint) && /^(?:Karte|[*]{4}\d{4})$/.test(result.hint)
    ? result
    : { fingerprint: '', hint: 'Karte' };
};
const field = (text: string, left: number, right?: number) => text.slice(left, right).trim();
const numericField = (text: string, left: number, right = text.length) => {
  const numeric = /[\d.,+−-]/u,
    continued = /[\p{L}\d.,+−-]/u;
  if (left > 0 && numeric.test(text[left] ?? '') && continued.test(text[left - 1] ?? ''))
    return null;
  if (
    right < text.length &&
    numeric.test(text[right - 1] ?? '') &&
    continued.test(text[right] ?? '')
  )
    return null;
  return field(text, left, right);
};
const cellCents = (text: string, left: number, right?: number) => {
  const raw = numericField(text, left, right);
  return raw === null ? null : cents(raw);
};
const cellDecimal = (text: string, left: number, right: number, scale: number) => {
  const raw = numericField(text, left, right);
  return raw === null ? null : decimal(raw.replace(/%$/, ''), scale);
};
const ISSUED_HEADER = /^\s*Karte\s+Umsatz\s+Buchung\s+Buchungstext\b/;
// Optional card index, transaction and booking day (DD.MM or DD.MM.), then the remaining cells.
const ISSUED_ROW_HEAD =
  /^\s*(?:([\d*]{1,19})\s+)?(\d{2}\.\d{2}\.?)\s+(\d{2}\.\d{2}\.?)(?:\s+(.*))?$/u;
const AMOUNT_CELL = String.raw`\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}`;
const SIGNED_CELL = String.raw`(${AMOUNT_CELL})\s?([+−-])`;
// Text (description, optional branch/location), then optionally foreign amount, ISO currency,
// rate, converted amount and fee, and always the signed final amount at the end of the line.
const ISSUED_ROW_TAIL = new RegExp(
  String.raw`^(.*?)(?:\s+(${AMOUNT_CELL})\s+([A-Z]{3})\s+(\d+,\d+)\s+${SIGNED_CELL}(?:\s+${SIGNED_CELL})?)?\s+${SIGNED_CELL}$`,
  'u',
);
const ISSUED_TABLE_TOTAL = new RegExp(String.raw`^\s*${SIGNED_CELL}\s*$`, 'u');
const SPACED_THOUSANDS = /\d \d{3},\d{2}\s?[+−-]$/u;
/** Digit-free lines directly above a repeated header are its captions. */
const headerFollows = (lines: readonly string[], at: number) => {
  for (let j = at + 1; j < Math.min(lines.length, at + 4); j++) {
    if (ISSUED_HEADER.test(lines[j]!)) return true;
    if (!lines[j]!.trim() || /\d/.test(lines[j]!)) return false;
  }
  return false;
};
const issue = (doc: CardDocument, reason: string) => {
  if (!doc.reasons.includes(reason)) doc.reasons.push(reason);
};
function rowDate(raw: string, previous: CardBoundary | null, current: string | null) {
  if (!current || !/^\d{2}\.\d{2}\.?$/.test(raw.trim())) return null;
  const short = raw.trim().replace(/\.$/, '');
  if (!previous) {
    // Without a prior boundary: the latest such day not after the issue date, within 62 days.
    const year = Number(current.slice(0, 4));
    const date = [year, year - 1]
      .map((y) => day(`${short}.${y}`))
      .find((d): d is string => d !== null && d <= current);
    if (!date) return null;
    const age = (Date.parse(current + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000;
    return age <= 62 ? date : null;
  }
  const possible: string[] = [];
  const from = Number(previous.issueDate.slice(0, 4)),
    to = Number(current.slice(0, 4));
  if (to - from > 1 || from > to) return null;
  for (let year = from; year <= to; year++) {
    const date = day(`${short}.${year}`);
    if (date && date > previous.issueDate && date <= current) possible.push(date);
  }
  return possible.length === 1 ? possible[0]! : null;
}
function kind(description: string, amount: number): CardRowKind {
  if (
    /\b(?:bargeld(?:behebung|abhebung)|cash\s+(?:advance|withdrawal)|umbuchung|überweisung|transfer|zahlungsrückbuchung|payment\s+(?:reversal|return))\b/i.test(
      description,
    )
  )
    return 'unknown';
  if (
    amount < 0 &&
    /\b(?:zahlung|einzahlung|payment|bankeinzug|storno|reversal)\b/i.test(description)
  )
    return 'unknown';
  if (amount > 0 && /^(?:zahlung|einzahlung|payment|bankeinzug)\b/i.test(description))
    return 'payment';
  if (amount > 0 && /\b(?:gutschrift|refund|rückerstattung|storno)\b/i.test(description))
    return 'refund';
  if (amount < 0 && /\b(?:gebühr|entgelt|fee)\b/i.test(description)) return 'fee';
  return amount < 0 ? 'purchase' : 'unknown';
}
/** A positive card row without payment/refund wording is a credit left for owner review. */
const cardKind = (description: string, amount: number): CardRowKind => {
  const rowKind = kind(description, amount);
  return rowKind === 'unknown' &&
    amount > 0 &&
    !/\b(?:bargeld(?:behebung|abhebung)|cash\s+(?:advance|withdrawal)|umbuchung|überweisung|transfer|zahlungsrückbuchung|payment\s+(?:reversal|return)|zahlung|einzahlung|payment|bankeinzug|storno|reversal)\b/i.test(
      description,
    )
    ? 'credit'
    : rowKind;
};

/** Pure, finite layout readers. Unknown columns/rows never become guessed financial actions. */
export function parseCardDocument(
  text: string,
  sha256: string,
  context: CardParseContext,
): CardDocument {
  const summary = parseStatementText(text, sha256);
  const doc: CardDocument = {
    parserVersion: 1,
    sha256,
    accountId: context.accountId,
    layout: null,
    summary,
    identity: null,
    previous: null,
    rows: [],
    totalsVerified: false,
    reasons: [],
  };
  if (text.length > 200000 || !/^[a-f0-9]{64}$/.test(sha256)) {
    issue(doc, 'source_unavailable');
    return doc;
  }
  const f = summary.fields,
    current = f.issueDate.value;
  if (current) {
    const reference = f.reference.value;
    doc.identity = {
      kind: reference ? 'printed_reference' : 'issued_date',
      key: JSON.stringify(
        reference
          ? ['reference', context.accountId, reference, current]
          : ['issued_date', context.accountId, current],
      ),
      issueDate: current,
      reference,
    };
  } else issue(doc, 'issue_date_required');
  if (f.currency.value !== context.currency) issue(doc, 'statement_currency_unavailable');
  const prior = context.previous;
  if (
    prior &&
    current &&
    prior.accountId === context.accountId &&
    prior.currency === context.currency &&
    prior.mappingKey === context.mappingKey &&
    prior.issueDate < current &&
    /^[a-f0-9]{64}$/.test(prior.sha256) &&
    prior.revision &&
    prior.intakeId &&
    safe(prior.payableCents)
  )
    doc.previous = prior;
  else if (prior) issue(doc, 'previous_source_changed');
  const lines = text.split(/\r?\n/);
  const consumer = lines.findIndex((l) => ISSUED_HEADER.test(l));
  const company = lines.findIndex(
    (l) => /\bMenge\b/.test(l) && /\b(?:Total|Toial)\s+Brut(?:to|o)\b/i.test(l),
  );
  if (consumer >= 0 === company >= 0) {
    issue(doc, 'layout_unavailable');
    return doc;
  }
  if (consumer >= 0) {
    doc.layout = 'issued_card';
    if (!doc.previous) issue(doc, 'previous_source_required');
    let header = lines[consumer]!,
      card = { fingerprint: '', hint: 'Karte' },
      inTable = true,
      rowsSinceHeader = 0,
      descriptionColumn: number | null = null,
      totalPending = false,
      totalMismatch = false,
      afterRow = false;
    for (let i = consumer + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (ISSUED_HEADER.test(line)) {
        header = line;
        inTable = true;
        rowsSinceHeader = 0;
        descriptionColumn = null;
        afterRow = false;
        continue;
      }
      // The header only proves the column vocabulary and currency. Extracted rows are not
      // aligned with its single-spaced words, so cells are read by token order and shape.
      const dateAt = header.indexOf('Umsatz'),
        bookedAt = header.indexOf('Buchung'),
        descriptionAt = header.indexOf('Buchungstext'),
        branchAt = header.indexOf('Branche'),
        foreignAt = header.indexOf('Betrag'),
        rateAt = header.indexOf('Kurs');
      const currency = /\b([A-Z]{3})\s+Betrag\b/.exec(header.slice(rateAt));
      if (
        !currency ||
        dateAt < 0 ||
        bookedAt <= dateAt ||
        descriptionAt <= bookedAt ||
        branchAt <= descriptionAt ||
        foreignAt <= branchAt ||
        rateAt <= foreignAt
      ) {
        issue(doc, 'columns_unavailable');
        break;
      }
      const head = ISSUED_ROW_HEAD.exec(line);
      if (!inTable) {
        if (head) issue(doc, 'transaction_outside_table');
        continue;
      }
      if (!line.trim()) continue;
      const followsRow = afterRow;
      afterRow = false;
      if (totalPending) {
        totalPending = false;
        const total = ISSUED_TABLE_TOTAL.exec(line);
        if (!total) {
          issue(doc, 'unrecognized_table_row');
          inTable = false;
          continue;
        }
        const printed = signed(`${total[1]}${total[2]}`);
        // The printed table total is the new card balance, the same figure as the summary Saldo.
        if (
          printed === null ||
          f.payableCents.value === null ||
          BigInt(printed) !== -BigInt(f.payableCents.value)
        ) {
          issue(doc, 'table_total_unverified');
          totalMismatch = true;
        }
        inTable = false;
        continue;
      }
      // A footnote marker ends the table only when the line is not itself a row.
      if (!head && /^\s*\*+/.test(line) && line.search(/\S/) < dateAt) {
        inTable = false;
        continue;
      }
      if (/^\s*(?:Seite|Page)\s+\d+\s*(?:von|of|\/)\s*\d+\s*$/i.test(line)) {
        inTable = false;
        continue;
      }
      // A printed page/form marker carries no amount and leaves the table open.
      if (/^\s*\d+_\d+\/\d+_\d+\s*$/.test(line)) continue;
      if (/^\s*_{3,}\s*$/.test(line)) {
        totalPending = true;
        continue;
      }
      if (!head) {
        const text = line.trim(),
          start = line.search(/\S/),
          last = doc.rows.at(-1);
        // Wrapped description text: short, digit-free, sign-free, directly below a row.
        if (
          last &&
          followsRow &&
          descriptionColumn !== null &&
          Math.abs(start - descriptionColumn) <= 2 &&
          text.length <= 40 &&
          !/\s{2,}/.test(text) &&
          !/\d|[+−-]$/u.test(text)
        ) {
          last.description = `${last.description} ${text}`;
          afterRow = true;
          continue;
        }
        // Header captions and sub-headers are finite, digit-free and cannot hide a financial row.
        if (!/\d/.test(line) && (!rowsSinceHeader || headerFollows(lines, i))) continue;
        // Any other digit-free text after rows is a footer: the table ends, later rows are refused.
        if (!/\d/.test(line)) {
          inTable = false;
          continue;
        }
        issue(doc, 'unrecognized_table_row');
        continue;
      }
      rowsSinceHeader++;
      descriptionColumn = null;
      const [, printedCard, rawDate, rawBooked] = head;
      const rest = head[4] ?? '';
      if (printedCard) card = cardIdentity(printedCard, context);
      // Bounded input keeps the backtracking row grammar linear in practice.
      const cells = rest.length <= 512 ? ISSUED_ROW_TAIL.exec(rest.trimEnd()) : null;
      const text = cells?.[1]!.trim() ?? '';
      let amount = cells ? signed(`${cells[9]}${cells[10]}`) : null;
      if (cells?.[2] !== undefined) {
        const foreign = cents(cells[2]),
          rate = decimal(cells[4]!, 9),
          converted = signed(`${cells[5]}${cells[6]}`),
          fee = cells[7] === undefined ? 0 : signed(`${cells[7]}${cells[8]}`);
        if (
          foreign === null ||
          foreign <= 0 ||
          rate === null ||
          rate <= 0 ||
          converted === null ||
          fee === null ||
          amount === null ||
          BigInt(converted) + BigInt(fee) !== BigInt(amount)
        )
          amount = null;
      }
      const description = text.split(/\s{2,}/)[0] ?? '';
      // `1 234,56`: a space thousands separator would otherwise read as 234,56.
      const spacedThousands =
        cells !== null && /(?:^|\s)\d{1,3}$/.test(text) && SPACED_THOUSANDS.test(rest.trimEnd());
      if (
        spacedThousands ||
        amount === null ||
        currency[1] !== context.currency ||
        !description ||
        /\d,\d|[+−-]$/u.test(text)
      ) {
        issue(doc, 'row_amount_or_fee_unavailable');
        continue;
      }
      descriptionColumn = line.length - rest.length + (rest.length - rest.trimStart().length);
      afterRow = true;
      const transactionDate = rowDate(rawDate!, doc.previous, current),
        bookingDate = rowDate(rawBooked!, doc.previous, current);
      if (!transactionDate || !bookingDate) issue(doc, 'row_year_unavailable');
      let rowKind = kind(description, amount);
      // A payment printed without a card index settles the card account, not one card.
      const accountLevel = !printedCard && rowKind === 'payment';
      if (printedCard) rowKind = cardKind(description, amount);
      if (rowKind === 'unknown') issue(doc, 'row_kind_unavailable');
      doc.rows.push({
        key: `${sha256}:${i + 1}`,
        line: i + 1,
        kind: rowKind,
        cardToken: accountLevel ? '' : card.fingerprint,
        cardHint: accountLevel ? 'Karte' : card.hint,
        accountId: accountLevel
          ? context.accountId
          : (context.mappedCardAccounts[card.fingerprint] ?? null),
        transactionDate,
        bookingDate,
        dateOrigin: doc.previous ? 'statement_boundaries' : 'issue_date',
        description,
        currency: currency[1]!,
        amountCents: amount,
        rebate: null,
      });
    }
    if (doc.previous && f.payableCents.value !== null && doc.rows.length) {
      const closing = doc.rows.reduce(
        (n, row) => n + BigInt(row.amountCents),
        -BigInt(doc.previous.payableCents),
      );
      doc.totalsVerified = closing === -BigInt(f.payableCents.value) && !totalMismatch;
    }
  } else {
    doc.layout = 'company_card';
    const header = lines[company]!,
      continuation = lines[company + 1] ?? '';
    const quantityAt = header.indexOf('Menge'),
      unitAt = header.search(/\bEinhei[ti]\b/),
      priceAt = header.search(/\bPrei[st]\s+pro\b/),
      rebateAt = header.search(/\bRabat(?:t)?\s+pro\b/),
      netAt = header.search(/\b(?:Total|Toial)\s+Net(?:to|o)\b/),
      grossAt = header.search(/\b(?:Total|Toial)\s+Brut(?:to|o)\b/);
    const vats = [...header.matchAll(/\bMwS[ti]\b/g)];
    const merchantAt = header.search(/\bBezogen\s+von\b/),
      productAt = header.search(/\bProduk[ti]\b/);
    if (
      !(
        quantityAt > productAt &&
        productAt > merchantAt &&
        merchantAt > 0 &&
        unitAt > quantityAt &&
        priceAt > unitAt &&
        rebateAt > priceAt &&
        netAt > rebateAt &&
        vats.length === 2 &&
        vats[0]!.index > netAt &&
        vats[1]!.index > vats[0]!.index &&
        grossAt > vats[1]!.index
      ) ||
      !/EUR/.test(continuation.slice(grossAt))
    ) {
      issue(doc, 'columns_unavailable');
      return doc;
    }
    const metadataCard = (line: string) => {
      if (
        /\d[\d.]*,\d|\d{2}\.\d{2}\.|\d{4}-\d{2}-\d{2}/.test(line) ||
        line.slice(quantityAt).trim()
      )
        return null;
      const match =
        /^\s*(?:Karten?(?:[- ]?(?:nummer|Nr\.?))?|Karien(?:nummer|Nr\.?)|Kennzeichen)\s*[: -]\s*([\d*xX -]+)/i.exec(
          line,
        );
      return match ? cardIdentity(match[1]!, context) : null;
    };
    let card = { fingerprint: '', hint: 'Karte' },
      cardGross = 0n,
      cardNet = 0n,
      cardVat = 0n,
      cardPending = false,
      subtotals = 0;
    let totalNet = 0n,
      totalVat = 0n,
      totalGross = 0n,
      companyTotals = 0,
      closed = false,
      companyVerified = false;
    for (const line of lines.slice(0, company)) card = metadataCard(line) || card;
    for (let i = company + 2; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*Gesamt\s+Firmensumme\b/i.test(line)) {
        companyTotals++;
        const net = cellCents(line, netAt, vats[0]!.index),
          vat = cellCents(line, vats[1]!.index, grossAt),
          gross = cellCents(line, grossAt);
        if (cardPending) issue(doc, 'card_subtotal_required');
        companyVerified =
          companyTotals === 1 &&
          net !== null &&
          vat !== null &&
          gross !== null &&
          BigInt(net) + BigInt(vat) === BigInt(gross) &&
          totalNet === BigInt(net) &&
          totalVat === BigInt(vat) &&
          totalGross === BigInt(gross);
        if (!companyVerified) issue(doc, 'company_subtotal_unverified');
        closed = true;
        continue;
      }
      if (closed) {
        // A closed table cannot hide another financial row, even if opposing amounts cancel.
        if (/\d[\d.]*,\d|\d{2}\.\d{2}\.|\d{4}-\d{2}-\d{2}/.test(line))
          issue(doc, 'transaction_outside_table');
        continue;
      }
      if (/\b(?:Gesamt|Getami)[ -]+(?:Kartensumme|Karientumme)\b/i.test(line)) {
        const net = cellCents(line, netAt, vats[0]!.index),
          vat = cellCents(line, vats[1]!.index, grossAt),
          gross = cellCents(line, grossAt);
        if (
          !cardPending ||
          net === null ||
          vat === null ||
          gross === null ||
          cardGross !== BigInt(gross) ||
          cardNet !== BigInt(net) ||
          cardVat !== BigInt(vat) ||
          BigInt(net) + BigInt(vat) !== BigInt(gross)
        )
          issue(doc, 'card_subtotal_unverified');
        cardGross = 0n;
        cardNet = 0n;
        cardVat = 0n;
        cardPending = false;
        subtotals++;
        continue;
      }
      const metadata = metadataCard(line);
      if (metadata) {
        if (cardPending) issue(doc, 'card_subtotal_required');
        card = metadata;
        continue;
      }
      const printedDay = /^\s*(\d{2}\.\d{2}\.\d{4})\b/.exec(line);
      if (!printedDay) {
        if (line.trim()) issue(doc, 'unrecognized_table_row');
        continue;
      }
      const date = day(printedDay[1]!);
      const net = cellCents(line, netAt, vats[0]!.index),
        vat = cellCents(line, vats[1]!.index, grossAt),
        gross = cellCents(line, grossAt);
      if (
        !date ||
        net === null ||
        vat === null ||
        gross === null ||
        BigInt(net) + BigInt(vat) !== BigInt(gross)
      ) {
        issue(doc, 'row_totals_unavailable');
        continue;
      }
      const quantity = cellDecimal(line, quantityAt, unitAt, 6),
        price = cellDecimal(line, priceAt, rebateAt, 6),
        discount = cellDecimal(line, rebateAt, netAt, 6),
        vatBp = cellDecimal(line, vats[0]!.index, vats[1]!.index, 2);
      let rebate: CardRow['rebate'] = null;
      if (
        quantity !== null &&
        price !== null &&
        discount !== null &&
        vatBp !== null &&
        quantity > 0 &&
        price > 0 &&
        discount > 0 &&
        discount < price &&
        vatBp >= 0 &&
        vatBp <= 10000 &&
        gross > 0
      ) {
        const original = mulDivRound(
          BigInt(quantity) * BigInt(price),
          10000 + vatBp,
          100000000000000,
        );
        const charged = mulDivRound(
          BigInt(quantity) * BigInt(price - discount),
          10000 + vatBp,
          100000000000000,
        );
        if (safe(original) && safe(charged) && charged === gross && original > gross)
          rebate = {
            quantityMicro: quantity,
            unitNetPriceMicro: price,
            unitNetDiscountMicro: discount,
            vatBp,
            originalGrossCents: original,
            chargedGrossCents: gross,
            creditCents: original - gross,
          };
      }
      const description =
        `${field(line, merchantAt, productAt)} ${field(line, productAt, quantityAt)}`.trim();
      cardGross += BigInt(gross);
      cardNet += BigInt(net);
      cardVat += BigInt(vat);
      cardPending = true;
      totalGross += BigInt(gross);
      totalNet += BigInt(net);
      totalVat += BigInt(vat);
      const rowKind = gross < 0 ? 'refund' : kind(description, -gross);
      if (rowKind === 'unknown') issue(doc, 'row_kind_unavailable');
      doc.rows.push({
        key: `${sha256}:${i + 1}`,
        line: i + 1,
        kind: rowKind,
        cardToken: card.fingerprint,
        cardHint: card.hint,
        accountId: context.mappedCardAccounts[card.fingerprint] ?? null,
        transactionDate: date,
        bookingDate: date,
        dateOrigin: 'printed',
        description,
        currency: context.currency,
        amountCents: -gross,
        rebate,
      });
    }
    if (cardPending || (doc.rows.length && !subtotals)) issue(doc, 'card_subtotal_required');
    if (companyTotals !== 1) issue(doc, 'company_subtotal_required');
    if (doc.rows.length && f.payableCents.value !== null && companyVerified && companyTotals === 1)
      doc.totalsVerified =
        doc.rows.reduce((n, row) => n - BigInt(row.amountCents), 0n) ===
        BigInt(f.payableCents.value);
  }
  if (!doc.rows.length) issue(doc, 'rows_unavailable');
  if (doc.rows.length > 1000 || doc.rows.some((row) => row.description.length > 1024))
    issue(doc, 'row_text_limit');
  const accountLevel = (row: CardRow) =>
    doc.layout === 'issued_card' &&
    row.kind === 'payment' &&
    !row.cardToken &&
    row.accountId === context.accountId;
  if (
    doc.rows.some(
      (row) => !accountLevel(row) && (!row.cardToken || row.accountId !== context.accountId),
    )
  )
    issue(doc, 'card_mapping_required');
  if (doc.layout === 'issued_card' && doc.previous) {
    const actual = [
      ...new Set(
        doc.rows.filter((row) => !accountLevel(row)).map((row) => normalize(row.cardToken)),
      ),
    ].sort();
    const previous = [...new Set(doc.previous.cardTokens.map(normalize))].sort();
    if (JSON.stringify(actual) !== JSON.stringify(previous)) issue(doc, 'previous_card_mismatch');
  }
  if (!doc.totalsVerified) issue(doc, 'closing_total_unverified');
  return doc;
}

export type CardBookingCandidate = {
  id: string;
  revision: string;
  accountId: string;
  currency: string;
  date: string;
  amountCents: number;
  counterpartyKey: string;
  rebateConsumed: boolean;
  creditCategoryIds: string[];
  singleExpenseCategoryId: string | null;
  singleExpenseSplitId: string | null;
  singleExpenseSplitRevision: string | null;
};
export type CardAssignment = {
  rowKey: string;
  categoryId: string;
  ruleId: string;
  ruleRevision: string;
};
export type CardRowAction =
  | { kind: 'link'; row: CardRow; booking: CardBookingCandidate }
  | { kind: 'create'; row: CardRow; assignment: CardAssignment }
  | {
      kind: 'rebate';
      row: CardRow;
      booking: CardBookingCandidate;
      creditCents: number;
      creditDate: string;
    }
  | { kind: 'pending'; row: CardRow; reason: string };

/** No DB writes. Existing gross is never changed, and a new net expense gets no second credit. */
export function planCardRows(
  doc: CardDocument,
  candidates: readonly CardBookingCandidate[],
  assignments: readonly CardAssignment[],
): CardRowAction[] {
  const eligibleFor = (row: CardRow) =>
    candidates.filter(
      (c) =>
        c.accountId === row.accountId && c.currency === row.currency && c.date === row.bookingDate,
    );
  const matches = (row: CardRow) =>
    eligibleFor(row).filter(
      (c) =>
        c.counterpartyKey === normalize(row.description) &&
        (c.amountCents === row.amountCents ||
          (row.rebate && c.amountCents === -row.rebate.originalGrossCents)),
    );
  const competing = new Set<string>();
  const owners = new Map<string, string>();
  for (const row of doc.rows)
    for (const candidate of matches(row)) {
      const previous = owners.get(candidate.id);
      if (previous && previous !== row.key) {
        competing.add(previous);
        competing.add(row.key);
      } else owners.set(candidate.id, row.key);
    }
  return doc.rows.map((row): CardRowAction => {
    const pending = (reason: string): CardRowAction => ({ kind: 'pending', row, reason });
    if (
      !doc.totalsVerified ||
      doc.reasons.length ||
      !row.bookingDate ||
      row.accountId !== doc.accountId
    )
      return pending('document_proof_incomplete');
    if (row.kind === 'payment') return pending('settlement_match_required');
    if (row.kind === 'credit') return pending('credit_review_required');
    if (!['purchase', 'fee', 'refund'].includes(row.kind)) return pending('row_kind_unavailable');
    if (competing.has(row.key)) return pending('rows_compete_for_existing_booking');
    const plausible = eligibleFor(row);
    const eligible = plausible.filter((c) => c.counterpartyKey === normalize(row.description));
    const exact = eligible.filter((c) => c.amountCents === row.amountCents);
    if (exact.length > 1) return pending('multiple_existing_matches');
    if (exact.length === 1) {
      const match = exact[0]!;
      if (
        !match.singleExpenseCategoryId ||
        !match.singleExpenseSplitId ||
        !match.singleExpenseSplitRevision
      )
        return pending('whole_expense_match_required');
      return { kind: 'link', row, booking: match };
    }
    if (row.rebate) {
      const gross = eligible.filter(
        (c) =>
          c.amountCents === -row.rebate!.originalGrossCents &&
          c.singleExpenseCategoryId &&
          c.singleExpenseSplitId &&
          c.singleExpenseSplitRevision,
      );
      if (gross.length > 1) return pending('multiple_gross_matches');
      if (gross.length === 1) {
        if (gross[0]!.rebateConsumed) return pending('original_credit_already_consumed');
        const existingCredit = candidates.some(
          (c) =>
            c.accountId === row.accountId &&
            c.currency === row.currency &&
            c.amountCents > 0 &&
            c.date >= (row.transactionDate ?? row.bookingDate!) &&
            c.date <= doc.identity!.issueDate &&
            (c.counterpartyKey === normalize(row.description) ||
              c.creditCategoryIds.includes(gross[0]!.singleExpenseCategoryId!)),
        );
        if (existingCredit) return pending('existing_credit_requires_review');
        return {
          kind: 'rebate',
          row,
          booking: gross[0]!,
          creditCents: row.rebate.creditCents,
          creditDate: row.bookingDate,
        };
      }
    }
    if (
      plausible.some(
        (c) =>
          c.amountCents === row.amountCents ||
          (row.rebate && c.amountCents === -row.rebate.originalGrossCents) ||
          c.counterpartyKey === normalize(row.description),
      )
    )
      return pending('plausible_existing_movement_requires_review');
    if (row.amountCents >= 0) return pending('credit_original_evidence_required');
    const choices = assignments.filter((a) => a.rowKey === row.key);
    if (choices.length !== 1) return pending('automatic_category_required');
    return { kind: 'create', row, assignment: choices[0]! };
  });
}
