import { describe, expect, it } from 'vitest';
import type { ExplorerResult } from './explorer';
import { explorerCsv, explorerTableHeaders } from './explorer-csv';

const fixture = (): ExplorerResult => ({
  query: { dim: 'empfaenger', cls: 'alle', cols: 'monat', period: '3M', meas: 'summe' },
  months: ['2024-01', '2024-02'],
  columns: [
    { key: '2024-01', months: ['2024-01'] },
    { key: '2024-02', months: ['2024-02'] },
  ],
  unit: 'cents',
  rows: [
    { key: 'first', label: 'Muster; "Ö"\nZeile', class: null, values: [1234, -234], total: 1000 },
    { key: 'second', label: '\t=SUM(1;2)', class: null, values: [0, 100], total: 100 },
  ],
  totals: { values: [1234, -134], total: 1100 },
  truncated: 0,
  good: 'low',
});

describe('Explorer CSV #627: one projection of the validated visible pivot', () => {
  it('retains literal row/column order, signed cents, footer, Unicode and CSV escaping', () => {
    const result = fixture();
    const before = JSON.stringify(result);
    expect(explorerTableHeaders(result)).toEqual(['Empfänger', 'Jän 24', 'Feb 24', 'Gesamt']);
    expect(explorerCsv(result)).toBe(
      '\uFEFF"record_type";"report_key";"period";"dimension";"class";"measure";"unit";"truncated_count";"row_key";"Empfänger";"Jän 24";"Feb 24";"Gesamt"\r\n' +
        '"data";"explorer";"3M";"empfaenger";"alle";"summe";"cents";0;"first";"Muster; ""Ö""\nZeile";1234;-234;1000\r\n' +
        '"data";"explorer";"3M";"empfaenger";"alle";"summe";"cents";0;"second";"\'\t=SUM(1;2)";0;100;100\r\n' +
        '"total";"explorer";"3M";"empfaenger";"alle";"summe";"cents";0;"";"Summe";1234;-134;1100\r\n',
    );
    expect(JSON.stringify(result)).toBe(before);
  });

  it.each(['=1+1', '+1', '-1', '@SUM(1)', '\t=1', '\r@SUM(1)', '  +1', '\u0000-1'])(
    'neutralises untrusted text %j, including control/whitespace prefixes',
    (text) => {
      const result = fixture();
      result.rows = [{ key: text, label: text, class: null, values: [-1234, 0], total: -1234 }];
      result.totals = null;
      expect(explorerCsv(result)).toContain(`"'${text}";"'${text}";-1234;0;-1234\r\n`);
    },
  );

  it('exports the 200 displayed rows and the provided full footer without recomputing it', () => {
    const result = fixture();
    result.rows = Array.from({ length: 200 }, (_, i) => ({
      key: `row-${i}`,
      label: `Synthetic ${i}`,
      class: null,
      values: [100, 0],
      total: 100,
    }));
    result.truncated = 1;
    // The visible footer includes the omitted 201st row, exactly as the current table does.
    result.totals = { values: [20100, 0], total: 20100 };
    const csv = explorerCsv(result);
    expect(csv.match(/^"data";/gm)).toHaveLength(200);
    expect(csv).toContain(';"cents";1;"row-199";"Synthetic 199";100;0;100\r\n');
    expect(csv).toContain(';"cents";1;"";"Summe";20100;0;20100\r\n');
    expect(csv).not.toContain('row-200');
  });

  it('keeps rounded-average cents and count units, without inventing an addable footer', () => {
    const average = fixture();
    average.query.meas = 'avg';
    average.rows = [{ key: 'a', label: 'Synthetic', class: null, values: [617, -117], total: 250 }];
    average.totals = null;
    expect(explorerTableHeaders(average)).toEqual(['Empfänger', 'Jän 24', 'Feb 24', 'Ø']);
    expect(explorerCsv(average)).toContain(';"avg";"cents";0;"a";"Synthetic";617;-117;250\r\n');
    expect(explorerCsv(average)).not.toContain('"total"');

    const count = fixture();
    count.query.meas = 'anzahl';
    count.unit = 'count';
    count.rows = [{ key: 'a', label: 'Synthetic', class: null, values: [2, 1], total: 2 }];
    count.totals = null;
    expect(explorerCsv(count)).toContain(';"anzahl";"count";0;"a";"Synthetic";2;1;2\r\n');
  });

  it('omits the extra total column for a single pivot column and marks an empty result', () => {
    const single = fixture();
    single.query.cols = 'keine';
    single.columns = [{ key: 'all', months: single.months }];
    single.rows = [{ key: 'a', label: 'Synthetic', class: null, values: [1234], total: 1234 }];
    single.totals = null;
    expect(explorerTableHeaders(single)).toEqual(['Empfänger', 'Zeitraum']);
    expect(explorerCsv(single)).toContain(';"a";"Synthetic";1234\r\n');

    const empty = fixture();
    empty.rows = [];
    empty.totals = null;
    expect(explorerCsv(empty)).toContain(
      '"empty";"explorer";"3M";"empfaenger";"alle";"summe";"cents";0;"";"";"";"";""\r\n',
    );
    expect(explorerCsv(empty)).not.toContain('"data"');
  });

  it('does not serialize unsafe or fractional numeric amounts as plausible financial data', () => {
    for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = fixture();
      result.rows[0]!.values[0] = value;
      expect(() => explorerCsv(result)).toThrow();
    }
  });
});
