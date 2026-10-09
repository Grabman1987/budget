/** Text helpers shared by the payslip layouts. Pure; no layout or employer is named here. */
import { payrollTotals, type PayslipInput } from './payroll-projects';
import type { ParsedPayrollDocument } from './payslip-intake';

/** Parse printed decimal amounts exactly; minus may precede or follow an amount. */
export function printedCents(value: string) {
  const compact = value.replace(/[\s.]/g, '').replace(/−/g, '-');
  if (!/^[+-]?\d+,\d{2}-?$/.test(compact)) throw new RangeError('Invalid printed amount');
  const negative = compact.startsWith('-') || compact.endsWith('-');
  const [whole, fraction] = compact.replace(/[+-]/g, '').split(',');
  const n = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(n) || n > 100_000_000_000) throw new RangeError('Amount out of range');
  return negative ? -n : n;
}
export const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
/** Letters only: no blanks, no underscores (underlined or letter-spaced print). */
export const squash = (s: string) => normalize(s).replace(/[\s_]/g, '');
/** Printed amounts of one text row with their end position. */
export const AMOUNT = /[+−-]?\s*\d+(?:\.\d{3})*,\d{2}-?/g;
export const amountsOf = (row: string) =>
  [...row.matchAll(AMOUNT)].map((m) => ({
    cents: printedCents(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));

const MONTHS = [
  'janner',
  'februar',
  'marz',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'dezember',
];
/** `MM.YYYY` that is not the tail of a `DD.MM.YYYY` date. */
const BARE_MONTH = /(?<![\d.])(0[1-9]|1[0-2])\.(20\d{2})(?!\d)/;

/**
 * Billing month of a payroll document. Order: `Abrechnungsmonat` with its value, a month name,
 * a bare `MM.YYYY` next to the label (printed above or below it), then a `YYYYMM` file name.
 */
export function detectPeriod(text: string, filename: string) {
  const content = text.match(
    /Abrechnungsmonat\s*:?\s*(?:(20\d{2})[-/]?(0[1-9]|1[0-2])|(0?[1-9]|1[0-2])[./\s-]+(20\d{2}))/i,
  );
  const named = normalize(text).match(/abrechnungsmonat\s*:?\s*([a-z]+)\s+(20\d{2})/);
  const namedIndex = named ? MONTHS.indexOf(named[1] === 'januar' ? 'janner' : named[1]!) : -1;
  const rows = text.split(/\r?\n/);
  const label = rows.findIndex((r) => /abrechnungsmonat/i.test(r));
  const near =
    label < 0
      ? null
      : rows
          .slice(Math.max(0, label - 2), label + 3)
          .map((r) => r.match(BARE_MONTH))
          .find(Boolean);
  const fallback = filename.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
  const month = content
    ? content[1]
      ? `${content[1]}-${content[2]}`
      : `${content[4]}-${content[3]!.padStart(2, '0')}`
    : named && namedIndex >= 0
      ? `${named[2]}-${String(namedIndex + 1).padStart(2, '0')}`
      : near
        ? `${near[2]}-${near[1]}`
        : fallback
          ? `${fallback[1]}-${fallback[2]}`
          : null;
  const periodSource: 'content' | 'filename' | null =
    content || (named && namedIndex >= 0) || near ? 'content' : fallback ? 'filename' : null;
  return { month, periodSource };
}

export type WageKind = 'reimbursement' | 'earning' | 'info';
/**
 * Generic wage-type labels. Tax-free reimbursements are never salary; everything that is part of the
 * printed gross total is an earning; employer-side and memo lines are information only.
 */
export function classifyWageLabel(plain: string): WageKind | undefined {
  if (
    /telearbeit|home\s?office|fahrgeld|reisespesen|reisekosten|kilometergeld|taggeld|diaten|dienstreise.*auslagen/.test(
      plain,
    )
  )
    return 'reimbursement';
  if (/pendlereuro|vorsorge\s*(?:bem|beitrag)|tages.{0,3}nachtig|nachtigungsgeld/.test(plain))
    return 'info';
  if (
    /gehalt|\blohn(?!steuer)|bonus|remuneration|urlaubszuschu|weihnachts|zulage|zuschlag|pramie|uberstunden|einmalzahlung|wr-?\s*zuschuss|provision|sachbezug|abfertigung|urlaubsersatz|laufender bezug/.test(
      plain,
    )
  )
    return 'earning';
  return undefined;
}

/** Common tail of all payslip layouts: draft, sum check and limits. */
export function finishPayslip(input: {
  documentType: ParsedPayrollDocument['documentType'];
  periodSource: ParsedPayrollDocument['periodSource'];
  payoutDate: string | null;
  month: string | null;
  gross: number | null;
  net: number | null;
  sv: number;
  tax: number;
  lines: PayslipInput['lines'];
  warnings: string[];
}): ParsedPayrollDocument {
  const { month, gross, net, warnings, documentType } = input;
  const draft: PayslipInput | null =
    month && gross !== null && net !== null
      ? {
          month,
          kind: documentType === 'bonus' ? 'special' : 'regular',
          specialType: documentType === 'bonus' ? 'other' : null,
          grossCents: gross,
          svCents: input.sv,
          taxCents: input.tax,
          netCents: net,
          bookingId: null,
          receiptId: null,
          lines: input.lines,
        }
      : null;
  const differenceCents = draft ? payrollTotals([draft]).calculatedNetCents - draft.netCents : null;
  if (draft && (draft.grossCents < 0 || draft.netCents < 0 || draft.lines.length > 40))
    warnings.push('Beträge oder Zeilenanzahl nicht unterstützt. Bitte manuell prüfen.');
  if (differenceCents !== null && Math.abs(differenceCents) > 1)
    warnings.push('Summenprüfung fehlgeschlagen.');
  return {
    documentType,
    periodSource: input.periodSource,
    payoutDate: input.payoutDate,
    draft,
    differenceCents,
    warnings: [...new Set(warnings)],
  };
}
