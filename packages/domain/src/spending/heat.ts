/**
 * Diverging heat per row (SPEC §6, decision 29.09.2026): each cell is compared with the average of
 * its row. Within 8 % of the average a cell stays neutral. `good` says which direction is good:
 * `low` for spending, `high` for income. Port of `heatStats`/`heatAttr` in `reports-core.js`.
 */
export type HeatGood = 'low' | 'high';

export interface HeatCell {
  /** `bad` is the pastel red, `good` the pastel green; `null` is neutral. */
  tone: 'good' | 'bad' | null;
  /** 0.25 to 1: how strongly the cell is coloured. */
  level: number;
}

const NEUTRAL: HeatCell = { tone: null, level: 0 };

export function heatCells(
  values: ReadonlyArray<number | null>,
  good: HeatGood = 'low',
): HeatCell[] {
  const xs = values.filter((x): x is number => x !== null && x !== 0);
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const dev = Math.max(...xs.map((x) => Math.abs(x - mean)), 1e-9);
  return values.map((x) => {
    if (x === null || x === 0) return NEUTRAL;
    const d = (x - mean) / dev;
    if (Math.abs(d) < 0.08 || Math.abs(x - mean) < Math.abs(mean) * 0.08) return NEUTRAL;
    const bad = good === 'low' ? d > 0 : d < 0;
    return { tone: bad ? 'bad' : 'good', level: Math.min(1, 0.25 + Math.abs(d) * 0.75) };
  });
}
