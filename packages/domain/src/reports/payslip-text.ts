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

/**
 * Every printed wage line of a payroll run (#1066), kept beside the legacy draft. `section` is the
 * parser's reading, not the owner's salary component: `benefit_in_kind` is an earning inside the
 * printed gross that is not paid out (Sachbezug), `memo` an information or employer line outside
 * the payout, `unknown` a line the parser could not place.
 */
export const WAGE_LINE_SECTIONS = [
  'earning',
  'benefit_in_kind',
  'reimbursement',
  'deduction',
  'tax_adjustment',
  'sv_adjustment',
  'memo',
  'unknown',
] as const;
export type WageLineSection = (typeof WAGE_LINE_SECTIONS)[number];
/**
 * `amountCents` is the signed effect on the payout: earnings, benefits in kind and reimbursements
 * are positive, deductions and statutory corrections negative when they lower the payout. Memo and
 * unknown lines carry the printed value. `quantity`/`rate` are the printed texts, only when the
 * row shows both unambiguously; `referenceMonth` only when printed in front of the wage type.
 */
export interface PayslipWageLine {
  order: number;
  code: string | null;
  label: string;
  section: WageLineSection;
  referenceMonth: string | null;
  quantity: string | null;
  rate: string | null;
  amountCents: number;
}
export type WageLineDraft = Omit<PayslipWageLine, 'order'>;
/** Statutory deductions split into current and special-payment parts; their sums equal sv/tax. */
export interface StatutorySplit {
  svCurrentCents: number;
  svSpecialCents: number;
  taxCurrentCents: number;
  taxOtherCents: number;
}
/** Why the wage lines do not reconcile with the printed gross; the upload is never refused for it. */
export type WageLineIssue = 'gross_mismatch' | 'no_gross';
/** Sachbezug: a taxable earning in kind inside the printed gross. */
export const isBenefitInKindLabel = (plain: string) => /sachbezug/.test(plain);
/** Payout effect of a legacy line amount (deductions and corrections are stored as charges). */
export const payoutEffect = (section: WageLineSection, legacyAmount: number) =>
  section === 'deduction' || section === 'tax_adjustment' || section === 'sv_adjustment'
    ? -legacyAmount
    : legacyAmount;
/** Printed quantity and rate when a row shows exactly three amounts (quantity, rate, amount). */
export const quantityAndRate = (texts: string[]) =>
  texts.length === 3
    ? { quantity: texts[0]!.trim(), rate: texts[1]!.trim() }
    : { quantity: null, rate: null };

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
  unmappedWageTypes?: NonNullable<ParsedPayrollDocument['unmappedWageTypes']>;
  wageLines?: WageLineDraft[];
  statutorySplit?: StatutorySplit | null;
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
    ...(input.unmappedWageTypes?.length ? { unmappedWageTypes: input.unmappedWageTypes } : {}),
    // #1066 additions; appended after every legacy field, which stays exactly as before.
    ...(input.wageLines
      ? wageLineFields(draft, input.wageLines, input.sv, input.tax, input.statutorySplit ?? null)
      : {}),
  };
}

/**
 * Number the lines and check the invariant: earnings plus benefits in kind equal the gross as the
 * layout defines it (printed gross without reimbursements). A miss is reported, never thrown.
 */
function wageLineFields(
  draft: PayslipInput | null,
  lines: WageLineDraft[],
  sv: number,
  tax: number,
  split: StatutorySplit | null,
): Pick<ParsedPayrollDocument, 'wageLines' | 'statutorySplit' | 'wageLineIssue'> {
  const wageLines = lines.map((line, order) => ({ order, ...line }));
  const earned = wageLines
    .filter((l) => l.section === 'earning' || l.section === 'benefit_in_kind')
    .reduce((n, l) => n + l.amountCents, 0);
  const issue: WageLineIssue | null = !draft
    ? 'no_gross'
    : earned !== draft.grossCents
      ? 'gross_mismatch'
      : null;
  const consistent =
    split &&
    split.svCurrentCents + split.svSpecialCents === sv &&
    split.taxCurrentCents + split.taxOtherCents === tax;
  return {
    wageLines,
    statutorySplit: consistent ? split : null,
    ...(issue ? { wageLineIssue: issue } : {}),
  };
}
