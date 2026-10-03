import { z } from 'zod';
import { payrollTotals, type PayslipInput } from './payroll-projects';

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
};
export interface PayslipAdapter {
  id: string;
  accepts(text: string): boolean;
  parse(text: string, filename: string, config: PayslipSourceConfig): ParsedPayrollDocument;
}

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
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** Label-driven Austrian payroll adapter. Owner mappings take precedence over label inference. */
export const austrianPayrollAdapter: PayslipAdapter = {
  id: 'austrian-wage-lines',
  accepts: (text) => /abrechnungsmonat|lohnart|zfa2|lgv|pensionskasse|mitarbeiterbonus/i.test(text),
  parse(text, filename, config) {
    const warnings: string[] = [];
    const normalized = normalize(text);
    const documentType =
      /pensionskasse/.test(normalized) && !/auszahlung/.test(normalized)
        ? 'pension'
        : text.split(/\r?\n/).some((row) => /^mitarbeiterbonus(?:\s|$)/i.test(row.trim()))
          ? 'bonus'
          : 'payslip';
    const content = text.match(
      /Abrechnungsmonat\s*:?\s*(?:(20\d{2})[-/]?(0[1-9]|1[0-2])|(0?[1-9]|1[0-2])[./\s-]+(20\d{2}))/i,
    );
    const fallback = filename.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/);
    const named = normalize(text).match(/abrechnungsmonat\s*:?\s*([a-z]+)\s+(20\d{2})/);
    const monthNames = [
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
    const namedIndex = named
      ? monthNames.indexOf(named[1] === 'januar' ? 'janner' : named[1]!)
      : -1;
    const month = content
      ? content[1]
        ? `${content[1]}-${content[2]}`
        : `${content[4]}-${content[3]!.padStart(2, '0')}`
      : named && namedIndex >= 0
        ? `${named[2]}-${String(namedIndex + 1).padStart(2, '0')}`
        : fallback
          ? `${fallback[1]}-${fallback[2]}`
          : null;
    const periodSource =
      content || (named && namedIndex >= 0) ? 'content' : fallback ? 'filename' : null;
    if (!month) warnings.push('Abrechnungsmonat fehlt.');
    if (periodSource === 'filename')
      warnings.push('Abrechnungsmonat nur aus dem Dateinamen erkannt.');
    const date = text.match(
      /(?:Auszahlungsdatum|Zahlungsdatum)\s*:?\s*(\d{2})\.(\d{2})\.(20\d{2})/i,
    );
    const payoutDate = date ? `${date[3]}-${date[2]}-${date[1]}` : null;
    let gross: number | null = null,
      net: number | null = null,
      sv = 0,
      tax = 0;
    let sawSv = false,
      sawTax = false;
    const lines: PayslipInput['lines'] = [];
    for (const row of text.split(/\r?\n/)) {
      const amounts = [...row.matchAll(/[+−-]?\s*\d+(?:\.\d{3})*,\d{2}-?/g)];
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
      let section = code ? config.wageTypes[code] : undefined;
      if (!section) {
        if (/telearbeit|fahrgeld|reisespesen|diaten|dienstreise.*auslagen/.test(plain))
          section = 'reimbursement';
        else if (adjustment && /lst|lohnsteuer/.test(plain)) section = 'tax_adjustment';
        else if (adjustment && /sv[-\s]?dn|sozialversicherung/.test(plain))
          section = 'sv_adjustment';
        else if (/sonstige.*abzuge|betriebsratsumlage/.test(plain)) section = 'deduction';
        else if (/grundgehalt|grundlohn|laufender bezug|mitarbeiterbonus/.test(plain))
          section = 'earning';
      }
      if (section === 'earning') continue; // Already included in the printed Brutto total.
      if (section) lines.push({ section, label: description.slice(0, 160), amountCents: amount });
      else if (code || /aufrollung/.test(plain))
        warnings.push('Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.');
    }
    if (documentType === 'pension')
      return {
        documentType,
        periodSource,
        payoutDate,
        draft: null,
        differenceCents: null,
        warnings: ['Pensionskassen-Mitteilung: kein Gehaltszettel.'],
      };
    if (gross === null || net === null || !sawSv || !sawTax)
      warnings.push('Brutto, SV, Lohnsteuer oder Auszahlung fehlt.');
    const draft: PayslipInput | null =
      month && gross !== null && net !== null
        ? {
            month,
            kind: documentType === 'bonus' ? 'special' : 'regular',
            specialType: documentType === 'bonus' ? 'other' : null,
            grossCents: gross,
            svCents: sv,
            taxCents: tax,
            netCents: net,
            bookingId: null,
            receiptId: null,
            lines,
          }
        : null;
    const differenceCents = draft
      ? payrollTotals([draft]).calculatedNetCents - draft.netCents
      : null;
    if (draft && (draft.grossCents < 0 || draft.netCents < 0 || draft.lines.length > 40))
      warnings.push('Beträge oder Zeilenanzahl nicht unterstützt. Bitte manuell prüfen.');
    if (differenceCents !== null && Math.abs(differenceCents) > 1)
      warnings.push('Summenprüfung fehlgeschlagen.');
    return {
      documentType,
      periodSource,
      payoutDate,
      draft,
      differenceCents,
      warnings: [...new Set(warnings)],
    };
  },
};

export function parsePayrollDocument(
  text: string,
  filename: string,
  config: PayslipSourceConfig,
  adapters: PayslipAdapter[] = [austrianPayrollAdapter],
): ParsedPayrollDocument {
  return (
    adapters.find((a) => a.accepts(text))?.parse(text, filename, config) ?? {
      documentType: 'unknown',
      draft: null,
      periodSource: null,
      payoutDate: null,
      differenceCents: null,
      warnings: ['Dokumentlayout nicht erkannt.'],
    }
  );
}
