import { z } from 'zod';
import type { PayslipInput } from './payroll-projects';
import { lgvPayrollAdapter } from './payslip-lgv';
import {
  AMOUNT,
  classifyWageLabel,
  detectPeriod,
  finishPayslip,
  normalize,
  printedCents,
} from './payslip-text';

export { printedCents };
/** Raise when the parser learns something new; pending scanned intakes are then read once more. */
export const PAYSLIP_PARSER_VERSION = 2;

export const wageTypes = [
  'earning',
  'deduction',
  'reimbursement',
  'tax_adjustment',
  'sv_adjustment',
] as const;
export const payslipSourceConfig = z.strictObject({
  salaryAccountId: z.string().min(1).max(64).nullable(),
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
  /** Parser version that produced this result; absent on results from before versioning. */
  parserVersion?: number;
};
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
    const lines: PayslipInput['lines'] = [];
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
        continue;
      }
      if (!code && /^(lst|lohnsteuer)/.test(plain) && !adjustment) {
        tax += amount;
        sawTax = true;
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
      if (section === 'earning') continue; // Already included in the printed Brutto total.
      if (section) lines.push({ section, label: description.slice(0, 160), amountCents: amount });
      else if (code || /aufrollung/.test(plain))
        warnings.push('Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.');
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
    });
  },
};

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
