import { parseMicro } from '@budget/domain';
import { parseCsv } from './csv';
import { MarketError } from './errors';
import { getText, type HttpOptions } from './http';
import type { CpiSource, MonthlyIndex } from './types';

/**
 * Statistik Austria open data (OGD, licence CC BY 4.0): "Verbraucherpreisindex Basis 2020,
 * ECOICOP", monthly from January 2021. The file holds the total index (`VPI-0`) and its sub-indices
 * per month (`VPIZR-YYYYMM`) and per year (`VPIZR-YYYY`); the column `F-VPIMZBM` is the index
 * number of the reporting month (2020 = 100) with a decimal comma. The newest month published is
 * whatever the file holds; a later index base would be a new dataset code.
 */
export const VPI_DATASET = 'OGD_vpi20_VPI_2020_1';
export const VPI_SERIES = 'vpi2020';
export const VPI_URL = `https://data.statistik.gv.at/data/${VPI_DATASET}.csv`;

export interface VpiOptions extends HttpOptions {
  url?: string;
}

/** Monthly total index of the OGD CSV (`;` separated) as micro-units, ascending. */
export function parseVpiCsv(text: string): MonthlyIndex[] {
  const rows = parseCsv(text, ';');
  if (rows.length === 0) return [];
  const first = rows[0] as Record<string, string>;
  if (!('C-VPIZR-0' in first) || !('C-VPI5NEU-0' in first) || !('F-VPIMZBM' in first))
    throw new MarketError('parse', 'columns');
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    if (row['C-VPI5NEU-0'] !== 'VPI-0') continue;
    const match = /^VPIZR-(\d{4})(\d{2})$/.exec(row['C-VPIZR-0'] ?? '');
    const value = row['F-VPIMZBM'] ?? '';
    if (!match || value === '') continue;
    try {
      byMonth.set(`${match[1]}-${match[2]}`, parseMicro(value.replace(',', '.')));
    } catch {
      throw new MarketError('parse', 'index value');
    }
  }
  return [...byMonth]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, indexMicro]) => ({ month, indexMicro }));
}

/** The Statistik Austria VPI, fetched as one small CSV. Needs no key. */
export function vpiSource(options: VpiOptions): CpiSource {
  return {
    series: VPI_SERIES,
    async monthly() {
      const rows = parseVpiCsv(await getText(options.url ?? VPI_URL, options, 'text/csv'));
      if (rows.length === 0) throw new MarketError('empty');
      return rows;
    },
  };
}
