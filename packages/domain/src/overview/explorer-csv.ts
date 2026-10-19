import { monthNameOnly } from '../date';
import {
  EXPLORER_DIMS,
  EXPLORER_ROW_LIMIT,
  parseExplorerQuery,
  type ExplorerResult,
} from './explorer';

/** The visible table headers, shared by the rendered pivot and its filtered CSV. */
export function explorerTableHeaders(result: ExplorerResult): string[] {
  const { query, columns } = result;
  const dimension = EXPLORER_DIMS.find((d) => d.id === query.dim)?.label;
  if (!dimension) throw new Error('Invalid Explorer dimension');
  const heads = columns.map(({ key }) => {
    switch (query.cols) {
      case 'monat':
        return `${monthNameOnly(key).slice(0, 3)} ${key.slice(2, 4)}`;
      case 'quartal': {
        const [year = '', quarter = ''] = key.split('-');
        return `${quarter} ${year.slice(2)}`;
      }
      case 'jahr':
        return key;
      case 'keine':
        return 'Zeitraum';
    }
  });
  return [
    dimension,
    ...heads,
    ...(columns.length > 1 ? [query.meas === 'avg' ? 'Ø' : 'Gesamt'] : []),
  ];
}

type Cell = string | number;

const integer = (value: number): number => {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid Explorer integer');
  return value;
};

const line = (cells: readonly Cell[]): string =>
  cells
    .map((value) => {
      if (typeof value === 'number') return String(integer(value));
      // Same spreadsheet safety convention as the full ZIP, without changing that export.
      const safe = /^[\p{White_Space}\p{Cc}]*[=+\-@]/u.test(value) ? `'${value}` : value;
      return `"${safe.replaceAll('"', '""')}"`;
    })
    .join(';') + '\r\n';

/** Read-only projection: no pivot, aggregation, rounding or localized numeric formatting. */
export function explorerCsv(result: ExplorerResult): string {
  if (
    !parseExplorerQuery({ ...result.query }) ||
    result.unit !== (result.query.meas === 'anzahl' ? 'count' : 'cents') ||
    result.rows.length > EXPLORER_ROW_LIMIT ||
    integer(result.truncated) < 0
  )
    throw new Error('Invalid Explorer result');

  const headers = explorerTableHeaders(result);
  const metadata = [
    'explorer',
    result.query.period,
    result.query.dim,
    result.query.cls,
    result.query.meas,
    result.unit,
    result.truncated,
  ];
  let csv =
    '\uFEFF' +
    line([
      'record_type',
      'report_key',
      'period',
      'dimension',
      'class',
      'measure',
      'unit',
      'truncated_count',
      'row_key',
      ...headers,
    ]);
  if (result.rows.length === 0)
    return csv + line(['empty', ...metadata, '', ...headers.map(() => '')]);

  const values = (cells: number[], total: number): number[] => {
    if (cells.length !== result.columns.length) throw new Error('Invalid Explorer columns');
    return [...cells.map(integer), ...(result.columns.length > 1 ? [integer(total)] : [])];
  };
  for (const row of result.rows)
    csv += line(['data', ...metadata, row.key, row.label, ...values(row.values, row.total)]);
  if (result.totals)
    csv += line([
      'total',
      ...metadata,
      '',
      'Summe',
      ...values(result.totals.values, result.totals.total),
    ]);
  return csv;
}
