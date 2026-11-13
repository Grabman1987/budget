import { parseAmount } from '../money';

/**
 * Deterministic proposal read from the text layer of a receipt or invoice PDF. Every field is a
 * candidate for the owner to confirm or correct; `null` means "not found with confidence".
 * No OCR, no network, no guessing: an ambiguous total stays empty.
 */
export type ReceiptProposal = {
  /** Positive integer cents. */
  totalCents: number | null;
  /** ISO day (YYYY-MM-DD). */
  date: string | null;
  /** First plausible issuer line, trimmed. */
  payee: string | null;
};

const AMOUNT = String.raw`(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})`;
// Strongest labels first; the lowest-numbered tier present in the document wins.
const TOTAL_TIERS: RegExp[] = [
  /zu\s+zahlen|zahlbetrag|rechnungsbetrag|gesamtbetrag|endbetrag|total\s+eur|amount\s+due/i,
  /\bgesamt\b|\bsumme\b|\btotal\b|\bbrutto\b/i,
];
const NOT_TOTAL =
  /zwischensumme|nettosumme|\bnetto\b|mwst|ust\b|steuer|rabatt|r[üu]ckgeld|bar\b|gegeben/i;
const DATE_LABEL = /rechnungsdatum|belegdatum|\bdatum\b|date/i;
const NOISE =
  /^(rechnung|beleg|kassenbon|kassabon|quittung|lieferschein|seite|page|invoice|receipt|danke|vielen dank)\b/i;

const pad = (n: number) => String(n).padStart(2, '0');

function validDay(d: number, m: number, y: number): string | null {
  if (y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > last ? null : `${y}-${pad(m)}-${pad(d)}`;
}

function datesIn(line: string): string[] {
  const found: string[] = [];
  for (const m of line.matchAll(/\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})\b/g)) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const day = validDay(Number(m[1]), Number(m[2]), year);
    if (day) found.push(day);
  }
  return found;
}

function totalCents(lines: string[]): number | null {
  for (const tier of TOTAL_TIERS) {
    const hits: number[] = [];
    for (const line of lines) {
      if (!tier.test(line) || NOT_TOTAL.test(line)) continue;
      const amounts = [...line.matchAll(new RegExp(AMOUNT, 'g'))].map((m) => m[1]!);
      // The printed total is the last amount of its line ("Gesamt 3 Artikel 12,50 EUR").
      const printed = amounts.at(-1);
      if (!printed) continue;
      const parsed = parseAmount(printed);
      if (parsed.ok && parsed.cents > 0) hits.push(parsed.cents);
    }
    if (hits.length) {
      // Repeated identical totals are fine; conflicting ones are ambiguous.
      return new Set(hits).size === 1 ? hits[0]! : null;
    }
  }
  return null;
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
    .filter(Boolean);
  return { totalCents: totalCents(lines), date: documentDate(lines), payee: payee(lines) };
}
