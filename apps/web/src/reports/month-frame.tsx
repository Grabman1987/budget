import { Button } from '@budget/ui';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { longDay } from '../ledger/format';
import { monthLabel, monthOf, shiftMonth } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { useMonth } from '../shell/use-month';
import './month-report.css';

/** Selected month of a report (`?monat=`), the current month by default. */
export function useReportMonth() {
  const [month, shift] = useMonth();
  return { month, shift, current: monthOf(new Date()) };
}

const SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
/** `2023-10` as "Okt 2023". */
export const shortMonth = (month: string) =>
  `${SHORT[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

/** "September 2026", with "bis 17.09." while the month is running. */
export function monthTitle(month: string, partial: boolean, asOf?: string): string {
  return partial && asOf ? `${monthLabel(month)} · bis ${asOf.slice(8, 10)}.` : monthLabel(month);
}

/** Steuerung "Monat": previous and next month around the label; no month after the current one. */
export function MonthControl({
  month,
  shift,
  current,
  firstMonth,
}: {
  month: string;
  shift: (delta: number) => void;
  current: string;
  /** First month with records, when known: nothing to see before it. */
  firstMonth?: string | undefined;
}) {
  return (
    <div className="mr-month" role="group" aria-label="Monat">
      <button
        type="button"
        className="icon-btn"
        aria-label="Vormonat"
        disabled={firstMonth !== undefined && shiftMonth(month, -1) < firstMonth}
        onClick={() => shift(-1)}
      >
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="mr-month-label" data-testid="report-month">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Nächster Monat"
        disabled={month >= current}
        onClick={() => shift(1)}
      >
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="ghost" size="sm" className="mr-print" onClick={() => window.print()}>
      <Printer className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      Drucken
    </Button>
  );
}

/**
 * Title block and registers of a report of the group "Monat und Einkommen": Steuerung "Monat"
 * (and "Drucken" on a print sheet), the data basis and the report body.
 */
export function MonthReportFrame({
  report,
  meta,
  month,
  shift,
  current,
  firstMonth,
  asOf,
  basis,
  print = false,
  extraFields = [],
  children,
}: {
  report: ReportEntry;
  meta: PageMeta;
  month: string;
  shift: (delta: number) => void;
  current: string;
  firstMonth?: string | undefined;
  /** The day the data is as of, once loaded. */
  asOf?: string | undefined;
  /** Replaces the data basis text (loading, unavailable). */
  basis?: ReactNode;
  print?: boolean;
  extraFields?: Array<{ label: string; value: ReactNode }>;
  children: ReactNode;
}) {
  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        basis ??
        (asOf && firstMonth ? `${shortMonth(firstMonth)} bis ${longDay(asOf)}` : 'wird geladen')
      }
      extraFields={[
        {
          label: 'Monat',
          value: (
            <MonthControl month={month} shift={shift} current={current} firstMonth={firstMonth} />
          ),
        },
        ...extraFields,
        ...(print ? [{ label: 'Blatt', value: <PrintButton /> }] : []),
      ]}
    >
      {children}
    </PageFrame>
  );
}
