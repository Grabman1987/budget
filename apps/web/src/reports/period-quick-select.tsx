import {
  isCalendarRange,
  isReportPeriod,
  quickReportPeriod,
  REPORT_QUICK_OPTIONS,
  todayInVienna,
  type Period,
  type ReportQuick,
} from '@budget/domain';
import { Button, Select, Segmented } from '@budget/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useId, useState } from 'react';
import './period-quick-select.css';

/** Retain existing segmented controls and add the common calendar selector. */
export function ReportPeriodControl({
  trend = true,
  ...props
}: {
  label: string;
  options: ReadonlyArray<{ value: Period; label: string }>;
  value: Period;
  onChange: (period: Period) => void;
  className?: string;
  trend?: boolean;
}) {
  return (
    <div className="report-period-control">
      <Segmented {...props} />
      <PeriodQuickSelect period={props.value} onChange={props.onChange} trend={trend} />
    </div>
  );
}

/** The same calendar ranges everywhere; legacy controls and links remain usable. */
export function PeriodQuickSelect({
  period: controlled,
  onChange,
  trend = true,
  customOnly = false,
}: {
  period?: Period;
  onChange?: (period: Period) => void;
  trend?: boolean;
  customOnly?: boolean;
}) {
  const search = useSearch({ strict: false }) as { zeitraum?: unknown; trend?: boolean };
  const navigate = useNavigate();
  const period = controlled ?? (isReportPeriod(search.zeitraum) ? search.zeitraum : 'YTD');
  const today = todayInVienna();
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(
    isCalendarRange(period) ? period.split('..')[0]! : today.slice(0, 7),
  );
  const [to, setTo] = useState(
    isCalendarRange(period) ? period.split('..')[1]! : today.slice(0, 7),
  );
  const id = useId();
  const change = (value: Period) => {
    if (onChange) onChange(value);
    else
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, zeitraum: value })) as never,
        replace: true,
      });
  };
  const matching = REPORT_QUICK_OPTIONS.find(
    ([key]) => key !== 'custom' && quickReportPeriod(key, today) === period,
  )?.[0];
  const legacy: Record<string, ReportQuick> = {
    '1M': 'previous',
    '3M': '3',
    '1J': '12',
    YTD: 'year',
    Alles: 'all',
  };
  const selected =
    customOnly && !custom ? '' : custom ? 'custom' : (matching ?? legacy[period] ?? 'custom');
  const valid = isCalendarRange(`${from}..${to}`) && to <= today.slice(0, 7);
  return (
    <div className="report-quick" role="group" aria-label="Berichtsfilter">
      <label htmlFor={id} className="sr-only">
        Zeitraum-Schnellauswahl
      </label>
      <Select
        id={id}
        value={selected}
        onChange={(e) => {
          const value = e.target.value as ReportQuick;
          setCustom(value === 'custom');
          if (value !== 'custom') change(quickReportPeriod(value, today));
          else if (isCalendarRange(period)) {
            setFrom(period.split('..')[0]!);
            setTo(period.split('..')[1]!);
          }
        }}
      >
        {customOnly && (
          <option value="" disabled>
            Zeitraum…
          </option>
        )}
        {REPORT_QUICK_OPTIONS.filter(([value]) => !customOnly || value === 'custom').map(
          ([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ),
        )}
      </Select>
      {(custom || (!customOnly && selected === 'custom' && isCalendarRange(period))) && (
        <form
          className="report-custom"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              change(`${from}..${to}`);
              setCustom(false);
            }
          }}
        >
          <label>
            Von
            <input
              type="month"
              min="1900-01"
              max={today.slice(0, 7)}
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Bis
            <input
              type="month"
              min={from || '1900-01'}
              max={today.slice(0, 7)}
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button type="submit" variant="ghost" disabled={!valid}>
            Anwenden
          </Button>
          {!valid && (
            <span role="status">
              Gültigen Monatsbereich bis heute wählen (höchstens 100 Jahre).
            </span>
          )}
        </form>
      )}
      {trend && (
        <label
          className="report-trend-control"
          title="Gepunktet: lineare Ausgleichsgerade der dargestellten Ist-Werte, keine Prognose"
        >
          <input
            type="checkbox"
            checked={search.trend === true}
            onChange={(e) =>
              void navigate({
                to: '.',
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  trend: e.target.checked || undefined,
                })) as never,
                replace: true,
              })
            }
          />
          Trendlinie
        </label>
      )}
    </div>
  );
}
