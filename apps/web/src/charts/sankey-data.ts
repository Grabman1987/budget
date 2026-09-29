import type { SankeyLink, SankeyNode } from './sankey-layout';

/** Hard-coded synthetic sample for the spike (cents): income → pool → classes → groups. */
const c = (euros: number) => euros * 100;

export const incomeColumn: SankeyNode[] = [
  { id: 'salary', name: 'Gehalt', value: c(3812), tone: 'inc' },
  { id: 'side', name: 'Nebeneinkünfte', value: c(240), tone: 'inc' },
  { id: 'refund', name: 'Erstattungen', value: c(60), tone: 'inc' },
];

export const poolColumn: SankeyNode[] = [{ id: 'pool', name: 'Einnahmen', value: c(4112) }];

export const classColumn: SankeyNode[] = [
  { id: 'need', name: 'Bedarf', value: c(2050), tone: 'need' },
  { id: 'want', name: 'Wunsch', value: c(900), tone: 'want' },
  { id: 'future', name: 'Zukunft', value: c(800), tone: 'future' },
  { id: 'rest', name: 'Übrig', value: c(362), tone: 'rest' },
];

export const groupColumn: SankeyNode[] = [
  { id: 'housing', name: 'Wohnen', value: c(1100), tone: 'need' },
  { id: 'food', name: 'Lebensmittel', value: c(600), tone: 'need' },
  { id: 'mobility', name: 'Mobilität', value: c(350), tone: 'need' },
  { id: 'leisure', name: 'Freizeit', value: c(500), tone: 'want' },
  { id: 'dining', name: 'Essen & Trinken', value: c(400), tone: 'want' },
  { id: 'reserve', name: 'Rücklagen', value: c(300), tone: 'future' },
  { id: 'invest', name: 'Investieren', value: c(500), tone: 'future' },
];

export const incomeLinks: SankeyLink[] = incomeColumn.map((n) => ({
  from: n.id,
  to: 'pool',
  value: n.value,
  tone: 'inc',
  label: n.name,
}));

export const classLinks: SankeyLink[] = classColumn.map((n) => ({
  from: 'pool',
  to: n.id,
  value: n.value,
  tone: n.tone ?? 'inc',
  label: n.name,
}));

const groupParent: Record<string, string> = {
  housing: 'need',
  food: 'need',
  mobility: 'need',
  leisure: 'want',
  dining: 'want',
  reserve: 'future',
  invest: 'future',
};

export const groupLinks: SankeyLink[] = groupColumn.map((n) => ({
  from: groupParent[n.id] ?? 'need',
  to: n.id,
  value: n.value,
  tone: n.tone ?? 'need',
  label: n.name,
}));
