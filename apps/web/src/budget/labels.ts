import { eur } from '../ledger/format';
import type { CategoryKind, TargetRow } from './api';

/** German labels of the category system (PRODUCT.md glossary, concept §3.2). */

export const KIND_LABEL: Record<CategoryKind, string> = {
  fixed: 'Fix',
  periodic: 'Periodisch',
  variable: 'Variabel',
  project: 'Projekt',
  saving: 'Sparen',
  invest: 'Investieren',
  debt: 'Kredit',
  advance: 'Auslagen',
  card_payment: 'Kartenzahlung',
  income: 'Einnahme',
};

/** The nine stages of the money-flow waterfall (SPEC §4, decision 28.09.2026). */
export const STAGES = [
  { n: 1, name: 'Fixkosten & Mindestraten', short: 'Fixkosten' },
  { n: 2, name: 'Laufender Monat', short: 'Laufend' },
  { n: 3, name: 'Liquiditätspuffer', short: 'Puffer' },
  { n: 4, name: 'Periodische Rücklagen', short: 'Rücklagen' },
  { n: 5, name: 'Notgroschen Minimum', short: 'Notgr. min.' },
  { n: 6, name: 'Teure Schulden', short: 'Teure Schulden' },
  { n: 7, name: 'Notgroschen Ziel & Sparziele', short: 'Sparziele' },
  { n: 8, name: 'Investieren', short: 'Investieren' },
  { n: 9, name: 'Günstige Schulden oder Investment', short: 'Günstig' },
] as const;

export const RHYTHM_LABEL: Record<number, string> = {
  1: 'jeden Monat',
  2: 'alle 2 Monate',
  3: 'vierteljährlich',
  6: 'halbjährlich',
  12: 'jährlich',
};

const monthYear = (day: string) => `${day.slice(5, 7)}.${day.slice(0, 4)}`;

/** "890,00 € jeden Monat, am 1." / "486,00 € bis 01.2027" / "Guthaben 500,00 €". */
export function targetText(t: TargetRow): string {
  const amount = eur(t.amountCents);
  if (t.kind === 'keep_balance') return `Guthaben ${amount} halten`;
  if (t.kind === 'by_date') return `${amount} bis ${monthYear(t.targetDate ?? '')}`;
  const rhythm = RHYTHM_LABEL[t.everyMonths] ?? `alle ${t.everyMonths} Monate`;
  const due =
    t.everyMonths > 1 && t.targetDate
      ? `, fällig ${monthYear(t.targetDate)}`
      : t.dueDay
        ? `, am ${t.dueDay}.`
        : '';
  return `${amount} ${rhythm}${due}`;
}
