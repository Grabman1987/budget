import { parseAmount } from '../money';

/**
 * Deterministic proposal read from the text layer of a receipt or invoice PDF. Every field is a
 * candidate for the owner to confirm or correct; `null` means "not found with confidence".
 * No OCR, no network, no guessing: an ambiguous total stays empty.
 */
export type ReceiptProposal = {
  /** Signed integer cents: positive for an invoice or till slip, negative for a credit note. */
  totalCents: number | null;
  /** ISO 4217 code printed next to the total; EUR when none is printed. */
  currency: string;
  /** ISO day (YYYY-MM-DD). */
  date: string | null;
  /** First plausible issuer line, trimmed. */
  payee: string | null;
};

/** Longer lines are not receipt lines; skipping them bounds regex work on hostile input. */
const MAX_LINE = 200;
const SIGN = '[-\u2212]';
const AMOUNT = String.raw`(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})`;
const AMOUNT_SIGNED = new RegExp(
  String.raw`(?<![\d.,])(${SIGN}\s?)?${AMOUNT}(\s?${SIGN})?(?![\d,])`,
  'g',
);
// Gross wording wins; plain "Gesamt/Total" is next; a bare "Summe" only when no tax is shown.
const GROSS =
  /zu\s+zahlen|zahlbetrag|rechnungsbetrag|gesamtbetrag|endbetrag|total\s+eur|amount\s+due|\binkl\b\.?|\bbrutto\b/i;
const TOTAL = /\bgesamt\b|\btotal\b/i;
const SUM = /\bsumme\b/i;
const NET_OR_PART = /zwischensumme|nettosumme|\bnetto\b|\bnet\b|davon|enthalten/i;
const CASH_OR_TAX = /rabatt|r[üu]ckgeld|gegeben|\bbar\b|\bmwst\b|\bust\b|steuer/i;
const TAX_HINT = /\bnetto\b|\bmwst\b|\bust\b|steuer/i;
const CURRENCY = /\b(EUR|USD|CHF|GBP)\b|(€)|(\$)|(£)/;
const DATE_LABEL = /\b(?:rechnungsdatum|belegdatum|datum|date)\b/i;
const NOISE =
  /^(rechnung|beleg|kassenbon|kassabon|quittung|lieferschein|seite|page|invoice|receipt|danke|vielen dank)\b/i;
const TOTAL_TIERS = [GROSS, TOTAL, SUM];

const pad = (n: number) => String(n).padStart(2, '0');

function validDay(d: number, m: number, y: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > last ? null : `${y}-${pad(m)}-${pad(d)}`;
}

function datesIn(line: string): string[] {
  const found: string[] = [];
  for (const m of line.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g)) {
    const day = validDay(Number(m[1]), Number(m[2]), Number(m[3]));
    if (day) found.push(day);
  }
  for (const m of line.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
    const day = validDay(Number(m[3]), Number(m[2]), Number(m[1]));
    if (day) found.push(day);
  }
  return found;
}

function totalOf(lines: string[]): { cents: number | null; currency: string } {
  const taxShown = lines.some((line) => TAX_HINT.test(line));
  for (const [index, tier] of TOTAL_TIERS.entries()) {
    if (index === 2 && taxShown) break; // net or gross cannot be told apart
    const hits: { cents: number; currency: string }[] = [];
    for (const line of lines) {
      if (!tier.test(line) || NET_OR_PART.test(line)) continue;
      if (!(index === 0 && GROSS.test(line)) && CASH_OR_TAX.test(line)) continue;
      const found = [...line.matchAll(AMOUNT_SIGNED)].at(-1);
      if (!found) continue;
      // The printed total is the last amount of its line ("Gesamt 3 Artikel 12,50 EUR").
      const parsed = parseAmount(found[2]!);
      if (!parsed.ok || parsed.cents <= 0) continue;
      const negative = Boolean(found[1] || found[3]);
      const code = CURRENCY.exec(line);
      const currency = code ? (code[1] ?? (code[2] ? 'EUR' : code[3] ? 'USD' : 'GBP')) : 'EUR';
      hits.push({ cents: negative ? -parsed.cents : parsed.cents, currency });
    }
    if (hits.length) {
      // Repeated identical totals are fine; conflicting ones are ambiguous.
      const first = hits[0]!;
      return hits.every((h) => h.cents === first.cents && h.currency === first.currency)
        ? { cents: first.cents, currency: first.currency }
        : { cents: null, currency: 'EUR' };
    }
  }
  return { cents: null, currency: 'EUR' };
}

function documentDate(lines: string[]): string | null {
  for (const line of lines)
    if (DATE_LABEL.test(line)) {
      const [day] = datesIn(line);
      if (day) return day;
    }
  for (const line of lines) {
    const [day] = datesIn(line);
    if (day) return day;
  }
  return null;
}

function payee(lines: string[]): string | null {
  for (const raw of lines.slice(0, 6)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 60) continue;
    if (!/\p{L}{3}/u.test(line) || NOISE.test(line)) continue;
    if (
      datesIn(line).length ||
      new RegExp(AMOUNT).test(line) ||
      /@|www\.|^\+?\d[\d\s/-]+$/.test(line)
    )
      continue;
    if (TOTAL_TIERS.some((tier) => tier.test(line))) continue;
    return line;
  }
  return null;
}

export function extractReceiptProposal(text: string): ReceiptProposal {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.length <= MAX_LINE);
  const total = totalOf(lines);
  return {
    totalCents: total.cents,
    currency: total.currency,
    date: documentDate(lines),
    payee: payee(lines),
  };
}
