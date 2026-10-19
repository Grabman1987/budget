import type { ExplorerResult } from '@budget/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchExplorerCsv } from './overview-api';

const result = (): ExplorerResult => ({
  query: { dim: 'empfaenger', cls: 'alle', cols: 'keine', period: '1M', meas: 'summe' },
  months: ['2024-01'],
  columns: [{ key: 'all', months: ['2024-01'] }],
  unit: 'cents',
  rows: [{ key: 'a', label: 'Synthetic', class: null, values: [1234], total: 1234 }],
  totals: null,
  truncated: 0,
  good: 'low',
});
const header =
  '\uFEFF"record_type";"report_key";"period";"dimension";"class";"measure";"unit";"truncated_count";"row_key";"Empfänger";"Zeitraum"\r\n';
const csv =
  header + '"data";"explorer";"1M";"empfaenger";"alle";"summe";"cents";0;"a";"Synthetic";1234\r\n';
const response = (text: string, filename = 'explorer-2024-01-2024-01.csv') =>
  new Response(text, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
afterEach(() => vi.unstubAllGlobals());

describe('Explorer #627 download equality guard', () => {
  it('rejects a relative-period rollover with identical amounts and the same 1M tuple', async () => {
    const view = result();
    expect(view.query.period).toBe('1M');
    expect(view.query.cols).toBe('keine');
    expect(view.months).toEqual(['2024-01']);
    // The authoritative February result has the exact same 1234-cent body as January.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(csv, 'explorer-2024-02-2024-02.csv')),
    );
    await expect(fetchExplorerCsv(view)).rejects.toThrow(/Daten haben sich geändert/);
  });
  it('preserves the BOM and only accepts the literal CSV of the current validated result', async () => {
    const fetch = vi.fn(async () => response(csv));
    vi.stubGlobal('fetch', fetch);
    const view = result();
    const before = structuredClone(view);
    const { blob, filename } = await fetchExplorerCsv(view);
    expect(filename).toBe('explorer-2024-01-2024-01.csv');
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await blob.arrayBuffer())).toBe(
      csv,
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/overview/explorer.csv?dim=empfaenger&cls=alle&cols=keine&period=1M&meas=summe',
      { credentials: 'same-origin' },
    );
    expect(view).toEqual(before);
  });

  it.each([
    csv.replace(';1234\r\n', ';1235\r\n'),
    csv.replace('"a";"Synthetic"', '"b";"Changed"'),
    csv.slice(1),
  ])(
    'rejects changed server amounts/rows or an absent BOM rather than downloading different data',
    async (serverCsv) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(serverCsv)),
      );
      await expect(fetchExplorerCsv(result())).rejects.toThrow(/Daten haben sich geändert/);
    },
  );

  it('rejects a concurrent change against the displayed 200-row result and its fixed footer', async () => {
    const view = result();
    view.rows = Array.from({ length: 200 }, (_, i) => ({
      key: `r${i}`,
      label: `Synthetic ${i}`,
      class: null,
      values: [100],
      total: 100,
    }));
    view.truncated = 1;
    view.totals = { values: [20100], total: 20100 };
    const body =
      header +
      view.rows
        .map(
          (_, i) =>
            `"data";"explorer";"1M";"empfaenger";"alle";"summe";"cents";1;"r${i}";"Synthetic ${i}";100\r\n`,
        )
        .join('') +
      '"total";"explorer";"1M";"empfaenger";"alle";"summe";"cents";1;"";"Summe";20100\r\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(body.replace(';100\r\n', ';101\r\n'))),
    );
    await expect(fetchExplorerCsv(view)).rejects.toThrow(/Daten haben sich geändert/);
    expect(view.totals).toEqual({ values: [20100], total: 20100 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(body.replace('"r199";"Synthetic 199"', '"new";"New row"'))),
    );
    await expect(fetchExplorerCsv(view)).rejects.toThrow(/Daten haben sich geändert/);
  });

  it('does not treat an HTTP error or an HTML response as a CSV download', async () => {
    for (const answer of [
      Response.json({ error: 'unauthenticated' }, { status: 401 }),
      new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => answer),
      );
      await expect(fetchExplorerCsv(result())).rejects.toThrow();
    }
  });
});
