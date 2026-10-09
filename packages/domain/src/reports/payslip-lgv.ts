import type { PayslipInput } from './payroll-projects';
import type { PayslipAdapter } from './payslip-intake';
import {
  amountsOf,
  classifyWageLabel,
  detectPeriod,
  finishPayslip,
  normalize,
  squash,
} from './payslip-text';

/**
 * Columnar payroll form: wage-type block ("Lohnart / Menge / Satz / Betrag") with a printed
 * "Summe der Bezüge", personal deductions below it, and a table of assessments and statutory
 * deductions whose columns (SV allgemein, SV Sonderzahlung, Lohnsteuer laufend, Lohnsteuer sonstige
 * Bezüge, Summe) are told apart by their position under the header row, plus the payout amount.
 *
 * The block structure decides what a line is: everything above the sum is a payment (already in the
 * printed total), tax-free reimbursements are split off, everything below it is a personal deduction.
 * Labels are only needed to find reimbursements; unknown labels need an owner mapping by wage type.
 */
const HEADER_CELLS = [
  /s\s*v\s*a\s*l\s*l\s*g\s*e\s*m\s*e\s*i\s*n/i,
  /s\s*v\s*s\s*o\s*n\s*d\s*e\s*r\s*z\s*a\s*h\s*l\s*u\s*n\s*g/i,
  /l\s*o\s*h\s*n\s*s\s*t\s*e\s*u\s*e\s*r\s*l\s*a\s*u\s*f\s*e\s*n\s*d/i,
  /l\s*s\s*t\s*s\s*o\s*n\s*s\s*t\s*i\s*g\s*e/i,
];
/**
 * Start positions of the four data columns, or null when the header row is not usable. The cells
 * must stand apart (two blanks at least): a heading squeezed into one run says nothing about columns.
 */
function columnStarts(header: string) {
  const found = HEADER_CELLS.map((rx) => rx.exec(header));
  const starts: number[] = [];
  let previousEnd = -1;
  for (const m of found) {
    if (!m || (previousEnd >= 0 && m.index - previousEnd < 2)) return null;
    starts.push(m.index);
    previousEnd = m.index + m[0].length;
  }
  return starts;
}
/** Right edge under the header cell: the last column whose header starts at or before it. */
const columnOf = (starts: number[], end: number) => {
  let column = -1;
  starts.forEach((start, i) => {
    if (end >= start - 1) column = i;
  });
  return column;
};
const lastAmount = (flat: string) => {
  const m = flat.match(/(\d+(?:\.\d{3})*,\d{2})-?$/);
  return m ? amountsOf(m[0]).at(-1)!.cents : null;
};

export const lgvPayrollAdapter: PayslipAdapter = {
  id: 'columnar-wage-block',
  accepts: (text) => {
    const flat = squash(text);
    return flat.includes('lohnart') && flat.includes('bemessungen');
  },
  parse(text, filename, config) {
    const rows = text.split(/\r?\n/);
    const flat = rows.map(squash);
    const warnings: string[] = [];
    const { month, periodSource } = detectPeriod(text, filename);
    if (!month) warnings.push('Abrechnungsmonat fehlt.');
    if (periodSource === 'filename')
      warnings.push('Abrechnungsmonat nur aus dem Dateinamen erkannt.');

    const head = flat.findIndex((r) => r.includes('lohnart'));
    const sumAt = flat.findIndex((r, i) => i > head && /summederbez.{1,2}ge/.test(r));
    const tableAt = flat.findIndex(
      (r, i) => i > head && r.includes('allgemein') && r.includes('sonderzahlung'),
    );
    const deductAt = flat.findIndex(
      (r, i) => tableAt >= 0 && i > tableAt && /^abz.{1,2}ge:?/.test(r),
    );

    // Printed gross total ("Summe der Bezüge"); the amount may sit on the next row.
    let printed: number | null = null;
    if (sumAt >= 0) {
      printed = lastAmount(flat[sumAt]!);
      if (printed === null && /^[\d.,-]+$/.test(flat[sumAt + 1] ?? ''))
        printed = lastAmount(flat[sumAt + 1]!);
    }
    if (printed === null) warnings.push('Summe der Bezüge nicht gefunden.');

    // Wage-type block.
    const lines: PayslipInput['lines'] = [];
    let reimbursed = 0;
    const blockEnd = tableAt >= 0 ? tableAt : rows.length;
    for (let i = head + 1; i < blockEnd; i++) {
      if (i === sumAt) continue;
      // Optional reference month (e.g. 32024 = 03/2024) in front of the wage type.
      const m = rows[i]!.trim().match(/^(?:\d{1,2}20\d{2}\s+)?(\d{3,4})\s+(\S.*)$/);
      if (!m) continue;
      const amounts = amountsOf(m[2]!);
      if (!amounts.length) continue;
      const code = m[1]!;
      const label = m[2]!
        .slice(0, amounts[0]!.start)
        .replace(/\s+/g, ' ')
        .replace(/^\*+/, '')
        .trim()
        .slice(0, 160);
      const amount = amounts.at(-1)!.cents;
      const plain = normalize(label);
      const kind = classifyWageLabel(plain);
      const owner = config.wageTypes[code];
      const below = sumAt >= 0 && i > sumAt;
      if (below) {
        // Personal deductions print with a trailing minus; memo and employer lines have 9xxx codes.
        if (owner === 'earning' || Number(code) >= 9000 || kind === 'info') continue;
        lines.push({
          section: 'deduction',
          label: label || `Lohnart ${code}`,
          amountCents: -amount,
        });
        continue;
      }
      if (owner === 'earning' || (!owner && kind === 'info')) continue;
      if (owner === 'reimbursement' || (!owner && kind === 'reimbursement')) {
        reimbursed += amount;
        lines.push({
          section: 'reimbursement',
          label: label || `Lohnart ${code}`,
          amountCents: amount,
        });
      } else if (owner) {
        lines.push({ section: owner, label: label || `Lohnart ${code}`, amountCents: amount });
      } else if (!kind) warnings.push('Unbekannte Lohnart oder Aufrollung: Zuordnung prüfen.');
    }

    // Statutory deductions by column.
    let sv = 0,
      tax = 0,
      net: number | null = null;
    const starts = tableAt >= 0 ? columnStarts(rows[tableAt]!) : null;
    if (!starts || deductAt < 0) {
      warnings.push('Tabelle der Abzüge (SV, Lohnsteuer) nicht erkannt.');
    } else {
      const sums = [0, 0, 0, 0];
      const adjustments = [0, 0, 0, 0];
      let unplaced = false;
      const place = (row: string, target: number[], dropTotal: boolean) => {
        const found = amountsOf(row);
        const total = dropTotal ? found.pop() : undefined;
        for (const a of found) {
          const column = columnOf(starts, a.end);
          if (column < 0) unplaced = true;
          else target[column]! += a.cents;
        }
        return total?.cents ?? null;
      };
      const statutory = place(rows[deductAt]!, sums, true);
      // Corrections ("Aufrollungen") are printed on their own row(s) above or beside the label.
      let after = deductAt + 1;
      for (; after < rows.length; after++) {
        const r = flat[after]!;
        if (r.includes('bankverbindung') || r.includes('auszahlung')) break;
        if (r.startsWith('aufrollungen') || /^[\d.,-]+$/.test(r))
          place(rows[after]!, adjustments, false);
      }
      sv = sums[0]! + sums[1]!;
      tax = sums[2]! + sums[3]!;
      const svAdjustment = adjustments[0]! + adjustments[1]!;
      const taxAdjustment = adjustments[2]! + adjustments[3]!;
      if (svAdjustment)
        lines.push({
          section: 'sv_adjustment',
          label: 'Aufrollung Sozialversicherung',
          amountCents: svAdjustment,
        });
      if (taxAdjustment)
        lines.push({
          section: 'tax_adjustment',
          label: 'Aufrollung Lohnsteuer',
          amountCents: taxAdjustment,
        });
      if (unplaced) warnings.push('Spalte der Abzüge nicht erkannt.');
      else if (statutory === null || sv + tax + svAdjustment + taxAdjustment !== statutory)
        warnings.push('Summe der gesetzlichen Abzüge stimmt nicht mit den Spalten überein.');

      // Payout: printed under the "Auszahlung" caption, usually on the bank row below it.
      const caption = flat.findIndex((r, i) => i >= after && r.includes('auszahlung'));
      for (let i = caption; caption >= 0 && i < Math.min(rows.length, caption + 4); i++) {
        const found = amountsOf(rows[i]!);
        if (found.length) {
          net = found.at(-1)!.cents;
          break;
        }
      }
    }
    if (net === null && starts) warnings.push('Auszahlung nicht gefunden.');

    return finishPayslip({
      documentType: 'payslip',
      periodSource,
      payoutDate: null,
      month,
      gross: printed === null ? null : printed - reimbursed,
      net,
      sv,
      tax,
      lines,
      warnings,
    });
  },
};
