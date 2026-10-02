import { parseMicro } from '@budget/domain';
import { parseCsv } from './csv';
import { MarketError } from './errors';
import { getText, type HttpOptions } from './http';
import type { CpiSource, MonthlyIndex } from './types';

/**
 * Statistik Austria open data (OGD, licence CC BY 4.0), consumer price index (VPI), total index:
 * - `OGD_vpi20_VPI_2020_1` "Verbraucherpreisindex Basis 2020, ECOICOP": January 2021 to December
 *   2025, 2020 average = 100;
 * - `OGD_vpi25c18_VPI_2025COICOP18_1` "Verbraucherpreisindex Basis 2025": from January 2026,
 *   2025 average = 100.
 * The files hold the total index and its sub-indices per month (`VPIZR-YYYYMM`) and per year
 * (`VPIZR-YYYY`); the column `F-VPIMZBM` is the index number of the reporting month (annual average
 * in the year rows) with a decimal comma.
 *
 * Chaining: the new index has the 2025 average as its base period (= 100), so a month of the new
 * base becomes a month of the old base by the factor "annual average 2025 on the old base / 100"
 * (the year row of the old file, 128,2 / 100). Statistik Austria publishes no separate factor in
 * the open data; the annual average of the base year is the standard link between two index
 * bases. Months that exist in both files keep the old value. The result is one series on the old
 * base (2020 = 100) that runs through the newest month of the new file; values have one decimal
 * in the source, so a chained month is accurate to about 0,1 index points.
 */
export const VPI_OLD_DATASET = 'OGD_vpi20_VPI_2020_1';
export const VPI_NEW_DATASET = 'OGD_vpi25c18_VPI_2025COICOP18_1';
/** Year whose average is 100 on the new base and the link between the two bases. */
export const VPI_NEW_BASE_YEAR = 2025;
export const VPI_SERIES = 'vpi';
export const VPI_OLD_URL = `https://data.statistik.gv.at/data/${VPI_OLD_DATASET}.csv`;
export const VPI_NEW_URL = `https://data.statistik.gv.at/data/${VPI_NEW_DATASET}.csv`;

export interface VpiOptions extends HttpOptions {
  /** Override the URLs (tests). */
  oldUrl?: string;
  newUrl?: string;
}

export interface VpiDataset {
  months: MonthlyIndex[];
  /** Annual averages (the `VPIZR-YYYY` rows) as micro-units. */
  annual: Array<{ year: number; indexMicro: number }>;
}

/** The two layouts of the total-index row: column holding the COICOP code, and the code itself. */
const LAYOUTS = [
  { column: 'C-VPI5NEU-0', total: 'VPI-0' },
  { column: 'C-VPICOICOP18_5-0', total: 'VPICOICOP18-0' },
] as const;

/** Monthly and annual total index of one OGD CSV (`;` separated) as micro-units, ascending. */
export function parseVpiDataset(text: string): VpiDataset {
  const rows = parseCsv(text, ';');
  if (rows.length === 0) return { months: [], annual: [] };
  const first = rows[0] as Record<string, string>;
  const layout = LAYOUTS.find((l) => l.column in first);
  if (!layout || !('C-VPIZR-0' in first) || !('F-VPIMZBM' in first))
    throw new MarketError('parse', 'columns');
  const months = new Map<string, number>();
  const annual = new Map<number, number>();
  for (const row of rows) {
    if (row[layout.column] !== layout.total) continue;
    const period = row['C-VPIZR-0'] ?? '';
    const value = row['F-VPIMZBM'] ?? '';
    const month = /^VPIZR-(\d{4})(\d{2})$/.exec(period);
    const year = /^VPIZR-(\d{4})$/.exec(period);
    if ((!month && !year) || value === '') continue;
    let micro: number;
    try {
      micro = parseMicro(value.replace(',', '.'));
    } catch {
      throw new MarketError('parse', 'index value');
    }
    if (month) months.set(`${month[1]}-${month[2]}`, micro);
    else if (year) annual.set(Number(year[1]), micro);
  }
  return {
    months: [...months]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, indexMicro]) => ({ month, indexMicro })),
    annual: [...annual]
      .sort(([a], [b]) => a - b)
      .map(([year, indexMicro]) => ({ year, indexMicro })),
  };
}

/** Months only, kept for callers that need nothing else. */
export const parseVpiCsv = (text: string): MonthlyIndex[] => parseVpiDataset(text).months;

/**
 * One series on the old base: the old months, then the months of the new base after them, scaled
 * by the annual average of the base year on the old base (or, without that year row, the mean of
 * its twelve old months). Without any way to link them, only the old series is returned.
 */
export function chainVpi(
  older: VpiDataset,
  newer: VpiDataset,
  baseYear: number = VPI_NEW_BASE_YEAR,
): MonthlyIndex[] {
  const lastOld = older.months[older.months.length - 1]?.month ?? '';
  const row = older.annual.find((a) => a.year === baseYear);
  const yearMonths = older.months.filter((m) => m.month.startsWith(`${baseYear}-`));
  const factorMicro = row
    ? row.indexMicro
    : yearMonths.length === 12
      ? Math.round(yearMonths.reduce((a, m) => a + m.indexMicro, 0) / 12)
      : null;
  if (factorMicro === null) return older.months;
  const extra = newer.months
    .filter((m) => m.month > lastOld)
    .map((m) => ({
      month: m.month,
      // new index (base 100) × old annual average / 100, all in micro-units, rounded once.
      indexMicro: Math.round((m.indexMicro * factorMicro) / 100_000_000),
    }));
  return [...older.months, ...extra];
}

/**
 * The Statistik Austria VPI: the old base and, when it is published, the new base chained onto
 * it. A missing new file (404) leaves the old series alone; any other failure fails the run.
 */
export function vpiSource(options: VpiOptions): CpiSource {
  return {
    series: VPI_SERIES,
    async monthly() {
      const older = parseVpiDataset(
        await getText(options.oldUrl ?? VPI_OLD_URL, options, 'text/csv'),
      );
      if (older.months.length === 0) throw new MarketError('empty');
      let newer: VpiDataset = { months: [], annual: [] };
      try {
        newer = parseVpiDataset(await getText(options.newUrl ?? VPI_NEW_URL, options, 'text/csv'));
      } catch (error) {
        if (!(error instanceof MarketError) || error.kind !== 'not_found') throw error;
      }
      return chainVpi(older, newer);
    },
  };
}
