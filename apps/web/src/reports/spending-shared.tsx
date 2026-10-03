import { ReportPeriodControl } from './period-quick-select';
import { isReportPeriod, SPENDING_PERIODS, type SpendingPeriod } from '@budget/domain';
import type { UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { MINUS } from '../ledger/format';
import './spending-reports.css';

/** Shared helpers of the reports of group 2 (Ausgaben und Plan). */

const MONTH_NAMES = [
  'Jän',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];
const MONTH_LONG = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** `2026-08` → `Aug 26` */
export const monthShort = (month: string) =>
  `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(2, 4)}`;
/** `2026-08` → `August 2026` */
export const monthLong = (month: string) =>
  `${MONTH_LONG[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

const percent = new Intl.NumberFormat('de-AT', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

/** Basis points as a de-AT percentage with the real minus (`12,3 %`); `–` without a value. */
export function bpText(bp: number | null, options: { sign?: boolean; digits?: 0 | 1 } = {}) {
  if (bp === null || !Number.isFinite(bp)) return '–';
  const value = options.digits === 0 ? Math.round(bp / 100) : bp / 100;
  const text = percent.format(Math.abs(Math.round(value * 10) / 10));
  const prefix = value < 0 ? MINUS : options.sign && value > 0 ? '+' : '';
  return `${prefix}${text} %`;
}

export const PERIOD_OPTIONS = SPENDING_PERIODS.map((value) => ({ value, label: value }));

const isPeriod = (value: unknown): value is SpendingPeriod => isReportPeriod(value);

/** Period of the spending reports (`?zeitraum=`, default the last 12 months). */
export function useReportPeriod(): [SpendingPeriod, (value: SpendingPeriod) => void] {
  const search = useSearch({ strict: false }) as { zeitraum?: unknown };
  const navigate = useNavigate();
  return [
    isPeriod(search.zeitraum) ? search.zeitraum : '1J',
    (value) =>
      void navigate({
        to: '.',
        search: ((previous: Record<string, unknown>) => ({
          ...previous,
          zeitraum: value,
        })) as never,
        replace: true,
      }),
  ];
}

export function PeriodSwitch({
  period,
  onChange,
}: {
  period: SpendingPeriod;
  onChange: (value: SpendingPeriod) => void;
}) {
  return (
    <ReportPeriodControl
      trend={false}
      label="Zeitraum"
      options={PERIOD_OPTIONS}
      value={period}
      onChange={onChange}
      className="seg-period"
    />
  );
}

/** Words for the window of a period next to a heading. */
export function periodName(period: SpendingPeriod, months: ReadonlyArray<string>): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return 'keine geschlossenen Monate';
  switch (period) {
    case '1M':
      return monthLong(last);
    case '3M':
      return `letzte ${months.length} Monate`;
    case 'YTD':
      return `Jän–${MONTH_NAMES[Number(last.slice(5, 7)) - 1] ?? ''} ${last.slice(0, 4)}`;
    case '1J':
      return `letzte ${months.length} Monate`;
    case '3J':
      return `letzte ${months.length} Monate`;
    default:
      if (period.includes('..')) return `${monthLong(first)} bis ${monthLong(last)}`;
      return `seit ${monthShort(first)}`;
  }
}

/** Loading, error and result of one report query, with the usual notes. */
export function ReportQuery<T>({
  query,
  what,
  children,
}: {
  query: UseQueryResult<T>;
  what: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isError)
    return <ErrorNote what={what} error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isFetching || !query.data) return <LoadingNote what={what} />;
  return <>{children(query.data)}</>;
}

/** Table region that keyboard users can scroll sideways. */
export function ScrollRegion({
  label,
  className = 'sr-scroll',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      role="region"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete table.
      tabIndex={0}
    >
      {children}
    </div>
  );
}
