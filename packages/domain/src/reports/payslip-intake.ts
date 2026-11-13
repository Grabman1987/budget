import { z } from 'zod';
import type { PayslipInput } from './payroll-projects';
import { lgvPayrollAdapter } from './payslip-lgv';
import {
  AMOUNT,
  classifyWageLabel,
  detectPeriod,
  finishPayslip,
  isBenefitInKindLabel,
  normalize,
  payoutEffect,
  printedCents,
  quantityAndRate,
  type PayslipWageLine,
  type StatutorySplit,
  type WageLineDraft,
  type WageLineIssue,
  type WageLineSection,
} from './payslip-text';

export { printedCents };
export {
  WAGE_LINE_SECTIONS,
  type PayslipWageLine,
  type StatutorySplit,
  type WageLineIssue,
  type WageLineSection,
} from './payslip-text';
/** Raise when the parser learns something new; pending scanned intakes are then read once more. */
export const PAYSLIP_PARSER_VERSION = 3;

export const wageTypes = [
  'earning',
  'deduction',
  'reimbursement',
  'tax_adjustment',
  'sv_adjustment',
] as const;
export const payslipSourceConfig = z.strictObject({
  salaryAccountId: z.string().min(1).max(64).nullable(),
  /** Explicit owner mapping; absent preserves the original manual workflow. */
  automation: z.strictObject({ payeeId: z.string().min(1).max(64) }).optional(),
  wageTypes: z
    .record(z.string().regex(/^\d{1,8}$/), z.enum(wageTypes))
    .refine((v) => Object.keys(v).length <= 200),
});
export type PayslipSourceConfig = z.infer<typeof payslipSourceConfig>;
export type ParsedPayrollDocument = {
  documentType: 'payslip' | 'bonus' | 'pension' | 'unknown';
  periodSource: 'content' | 'filename' | null;
  payoutDate: string | null;
  draft: PayslipInput | null;
  differenceCents: number | null;
  warnings: string[];
  /** Numeric wage codes whose section could not be inferred; older stored parses may omit this. */
  unmappedWageTypes?: { code: string; label: string; amountCents: number }[];
  /** Parser version that produced this result; absent on results from before versioning. */
  parserVersion?: number;
  /** #1066: every printed wage line; absent on letters and on results from before #1066. */
  wageLines?: PayslipWageLine[];
  /** #1066: statutory deductions split by current/special part; null when not readable. */
  statutorySplit?: StatutorySplit | null;
  /** #1066: set when the wage lines do not reconcile with the gross. */
  wageLineIssue?: WageLineIssue;
};

const isCalendarDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(value);
};

/** Only a payout day printed by the source is a date proposal; otherwise require an owner choice. */
export function proposedPayslipPayoutDate(parsed: ParsedPayrollDocument): string | null {
  if (parsed.payoutDate && isCalendarDay(parsed.payoutDate)) return parsed.payoutDate;
  return null;
}
export interface PayslipAdapter {
  id: string;
  accepts(text: string): boolean;
  parse(text: string, filename: string, config: PayslipSourceConfig): ParsedPayrollDocument;
}

/** Label-driven Austrian payroll adapter. Owner mappings take precedence over label inference. */
export const austrianPayrollAdapter: PayslipAdapter = {
  id: 'austrian-wage-lines',
  accepts: (text) =>
    /abrechnungsmonat|lohnart|zfa2|lgv|pensionskasse|mitarbeiterbonus|bonus[\s\S]{0,200}(?:brutto|gross)/i.test(
      text,
    ),
  parse(text, filename, config) {
    const warnings: string[] = [];
    const normalized = normalize(text);
    // A real payroll run has wage-type or assessment columns; letters only mention payouts.
    const payrollRun = /\blohnart\b|bemessungen|summe\s*der\s*bez/.test(normalized);
    // Letters about a bonus or the company pension are filed, not turned into a payslip draft.
    const bonusLetter =
      !payrollRun &&
      /\bbonus\b/.test(normalized) &&
      /(?:brutto|gross)\s*[\d.,]+|[\d.,]+\s*(?:brutto|gross)/.test(normalized);
    const documentType = bonusLetter
      ? 'bonus'
      : /pensionskasse/.test(normalized) && !payrollRun && !/\bauszahlung\b/.test(normalized)
        ? 'pension'
        : text.split(/\r?\n/).some((row) => /^mitarbeiterbonus(?:\s|$)/i.test(row.trim()))
          ? 'bonus'
          : 'payslip';
    const { month, periodSource } = detectPeriod(text, filename);
    if (!month) warnings.push('Abrechnungsmonat fehlt.');
    if (periodSource === 'filename')
      warnings.push('Abrechnungsmonat nur aus dem Dateinamen erkannt.');
    const date = text.match(
      /(?:Auszahlungsdatum|Zahlungsdatum)\s*:?\s*(\d{2})\.(\d{2})\.(20\d{2})/i,
    );
    const payoutDate = date ? `${date[3]}-${date[2]}-${date[1]}` : null;
    if (documentType === 'pension' || bonusLetter)
      return {
        documentType,
        periodSource,
        payoutDate,
        draft: null,
        differenceCents: null,
        warnings: [
          bonusLetter
            ? 'Bonus-Mitteilung: kein Gehaltszettel.'
            : 'Pensionskassen-Mitteilung: kein Gehaltszettel.',
        ],
      };
    let gross: number | null = null,
      net: number | null = null,
      sv = 0,
      tax = 0;
    let sawSv = false,
      sawTax = false;
    const unmappedWageTypes: NonNullable<ParsedPayrollDocument['unmappedWageTypes']> = [];
    const lines: PayslipInput['lines'] = [];
    const wageLines: WageLineDraft[] = [];
    const split = { svCurrentCents: 0, svSpecialCents: 0, taxCurrentCents: 0, taxOtherCents: 0 };
    let splitReadable = true;
    for (const row of text.split(/\r?\n/)) {
      const amounts = [...row.matchAll(AMOUNT)];
      if (!amounts.length) continue;
      const amount = printedCents(amounts.at(-1)![0]);
      const label = row.slice(0, amounts[0]!.index).trim();
      const plain = normalize(label);
      if (/^(?:gesamt\s*|summe\s*)?brutto(?:bezuge)?\s*:?$/.test(plain)) {
        if (gross !== null) warnings.push('Mehrere Bruttosummen: manuell prüfen.');
        gross = amount;
        continue;
      }
      if (/^auszahlung(?:sbetrag)?\s*:?$/.test(plain)) {
        if (net !== null) warnings.push('Mehrere Auszahlungen: manuell prüfen.');
        net = amount;
        continue;
      }
      const code = label.match(/^(\d{1,8})\s+/)?.[1];
      const description = code ? label.replace(/^\d+\s+/, '') : label;
      const adjustment = /aufrollung|erstattung/.test(plain);
      if (!code && /^(sv[-\s]?dn|sozialversicherung)/.test(plain) && !adjustment) {
        sv += amount;
        sawSv = true;
        if (SPECIAL_PART.test(plain)) split.svSpecialCents += amount;
        else if (CURRENT_PART.test(plain)) split.svCurrentCents += amount;
        else splitReadable = false;
        continue;
      }
      if (!code && /^(lst|lohnsteuer)/.test(plain) && !adjustment) {
        tax += amount;
        sawTax = true;
        if (SPECIAL_PART.test(plain) || /sonstig/.test(plain)) split.taxOtherCents += amount;
        else if (CURRENT_PART.test(plain)) split.taxCurrentCents += amount;
        else splitReadable = false;
        continue;
      }
      let section: (typeof lines)[number]['section'] | undefined = code
        ? config.wageTypes[code]
        : undefined;
      if (!section) {
        const kind = classifyWageLabel(plain);
        if (kind === 'reimbursement') section = 'reimbursement';
        else if (kind === 'earning') section = 'earning';
        else if (adjustment && /lst|lohnsteuer/.test(plain)) section = 'tax_adjustment';
        else if (adjustment && /sv[-\s]?dn|sozialversicherung/.test(plain))
          section = 'sv_adjustment';
        else if (/sonstige.*abzuge|betriebsratsumlage/.test(plain)) section = 'deduction';
      }
      const wageSection: WageLineSection =
        section === 'earning'
          ? isBenefitInKindLabel(plain)
            ? 'benefit_in_kind'
            : 'earning'
          : (section ?? (classifyWageLabel(plain) === 'info' ? 'memo' : 'unknown'));
      wageLines.push({
        code: code ?? null,
        label: description.slice(0, 160),
        section: wageSection,
        referenceMonth: null,
        ...quantityAndRate(amounts.map((a) => a[0])),
        amountCents: payoutEffect(wageSection, amount),
      });
      if (section === 'earning') continue; // Already included in the printed Brutto total.
      if (section) lines.push({ section, label: description.slice(0, 160), amountCents: amount });
      else if (code || /aufrollung/.test(plain)) {
        warnings.push('Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.');
        if (code)
          unmappedWageTypes.push({
            code,
            label: description.slice(0, 160),
            amountCents: amount,
          });
      }
    }
    if (gross === null || net === null || !sawSv || !sawTax)
      warnings.push('Brutto, SV, Lohnsteuer oder Auszahlung fehlt.');
    return finishPayslip({
      documentType,
      periodSource,
      payoutDate,
      month,
      gross,
      net,
      sv,
      tax,
      lines,
      warnings,
      unmappedWageTypes,
      wageLines,
      statutorySplit: splitReadable && (sawSv || sawTax) ? split : null,
    });
  },
};

/** Statutory rows of the special-payment part ("SZ", "Sonderzahlung") and of the current part. */
const SPECIAL_PART = /\bsz\b|sonderz/;
const CURRENT_PART = /laufend|\blfd\b/;

/** Most specific layout first; the label-driven adapter is the general fallback. */
export const defaultPayslipAdapters: PayslipAdapter[] = [lgvPayrollAdapter, austrianPayrollAdapter];

export function parsePayrollDocument(
  text: string,
  filename: string,
  config: PayslipSourceConfig,
  adapters: PayslipAdapter[] = defaultPayslipAdapters,
): ParsedPayrollDocument {
  const parsed = adapters.find((a) => a.accepts(text))?.parse(text, filename, config) ?? {
    documentType: 'unknown' as const,
    draft: null,
    periodSource: null,
    payoutDate: null,
    differenceCents: null,
    warnings: ['Dokumentlayout nicht erkannt.'],
  };
  return { ...parsed, parserVersion: PAYSLIP_PARSER_VERSION };
}
