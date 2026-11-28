/** Open items of a contact since the last settlement, as the owner can send them (read-only). */
export interface OpenSummaryInput {
  outlays: readonly {
    date: string;
    payeeName?: string | null;
    memo?: string | null;
    remainingCents: number;
  }[];
  /** Credit lots the contact holds; only `usable` ones offset the outlays. */
  credits: readonly { remainingCents: number; usable: boolean }[];
  /** Expected contributions that are due and not yet received. */
  contributions: readonly { name: string; dueDate: string; amountCents: number }[];
}

export interface OpenSummary {
  outlayCents: number;
  /** Usable credit that actually reduces the outlays (never more than the outlays). */
  creditCents: number;
  contributionCents: number;
  /** Outlays minus applied credit plus due contributions. */
  dueCents: number;
  text: string;
}

const isoDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const decimal = new Intl.NumberFormat('de-AT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const euro = (cents: number) => `${decimal.format(cents / 100).replace(/\s/g, ' ')} €`;

/**
 * Totals and a plain German list for "Offen seit letztem Ausgleich". Integer cents only; the
 * credit offsets the outlays but never turns the outlay part negative.
 */
export function summarizeOpenSinceSettlement(input: OpenSummaryInput): OpenSummary {
  const outlays = input.outlays.filter((o) => o.remainingCents > 0);
  const outlayCents = outlays.reduce((s, o) => s + o.remainingCents, 0);
  const usable = input.credits.reduce((s, c) => (c.usable ? s + c.remainingCents : s), 0);
  const creditCents = Math.min(usable, outlayCents);
  const contributions = input.contributions.filter((c) => c.amountCents > 0);
  const contributionCents = contributions.reduce((s, c) => s + c.amountCents, 0);
  const dueCents = outlayCents - creditCents + contributionCents;
  const lines: string[] = [];
  if (outlays.length) {
    lines.push('Offene Auslagen:');
    for (const o of [...outlays].sort((a, b) => a.date.localeCompare(b.date))) {
      const what = [o.payeeName, o.memo].filter((x): x is string => !!x && x.trim() !== '');
      lines.push(`${isoDay(o.date)} ${what.join(' - ') || 'Auslage'}: ${euro(o.remainingCents)}`);
    }
    lines.push(`Summe Auslagen: ${euro(outlayCents)}`);
  }
  if (creditCents > 0) lines.push(`Abzüglich Guthaben: -${euro(creditCents)}`);
  if (contributions.length) {
    if (lines.length) lines.push('');
    lines.push('Fällige Beiträge:');
    for (const c of [...contributions].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
      lines.push(`${isoDay(c.dueDate)} ${c.name}: ${euro(c.amountCents)}`);
  }
  lines.push(...(lines.length ? [''] : []), `Gesamt offen: ${euro(dueCents)}`);
  return { outlayCents, creditCents, contributionCents, dueCents, text: lines.join('\n') };
}
