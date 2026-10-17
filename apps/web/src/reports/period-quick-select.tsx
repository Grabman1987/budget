import {
  addMonths,
  isCalendarRange,
  monthsBetween,
  isReportPeriod,
  quickReportPeriod,
  REPORT_QUICK_OPTIONS,
  todayInVienna,
  type Period,
  type ReportQuick,
} from '@budget/domain';
import { Button, Select, Segmented, Switch } from '@budget/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import './period-quick-select.css';

/** The calendar months a period stands for; `undefined` for Alles. YTD is the whole calendar year. */
function windowOf(period: Period, today: string): [string, string] | undefined {
  if (isCalendarRange(period)) return period.split('..') as [string, string];
  const last = addMonths(today.slice(0, 7), -1);
  const lengths: Record<string, number> = { '1M': 1, '3M': 3, '1J': 12, '3J': 36 };
  const length = lengths[period];
  if (length) return [addMonths(last, 1 - length), last];
  const year = today.slice(0, 4);
  return period === 'YTD' ? [`${year}-01`, `${year}-12`] : undefined;
}

/** One step back (-1) or forward (+1) by the length of the window; none into the future. */
export function shiftPeriod(period: Period, step: -1 | 1, today: string): Period | undefined {
  const window = windowOf(period, today);
  if (!window) return undefined;
  const months = monthsBetween(window[0], window[1]).length * step;
  const [from, to] = [addMonths(window[0], months), addMonths(window[1], months)];
  const shifted = `${from}..${to}`;
  return isCalendarRange(shifted) && to <= today.slice(0, 7) ? shifted : undefined;
}

/**
 * The one period control of a report: the preset segment, a step back and forward by the length of
 * the window, and a popover with the calendar ranges, a custom range and the trend line switch.
 */
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
  const today = todayInVienna();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const previous = shiftPeriod(props.value, -1, today);
  const next = shiftPeriod(props.value, 1, today);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector('select')?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div className="report-period-control" ref={root}>
      <button
        type="button"
        className="rpc-step"
        aria-label="Voriger Zeitraum"
        disabled={!previous}
        onClick={() => previous && props.onChange(previous)}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <Segmented {...props} />
      <button
        type="button"
        className="rpc-step"
        aria-label="Nächster Zeitraum"
        disabled={!next}
        onClick={() => next && props.onChange(next)}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        ref={toggle}
        className="rpc-step rpc-range"
        aria-label="Zeitraum wählen"
        title="Zeitraum wählen"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarRange size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="rpc-popover" role="dialog" aria-label="Zeitraum und Trendlinie">
          <PeriodQuickSelect
            period={props.value}
            onChange={(period) => {
              props.onChange(period);
              close();
            }}
            trend={trend}
          />
        </div>
      )}
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
        <div
          className="report-trend-control"
          title="Gepunktet: lineare Ausgleichsgerade der dargestellten Ist-Werte, keine Prognose"
        >
          <span id={`${id}-trend`}>Trendlinie</span>
          <Switch
            labelledBy={`${id}-trend`}
            checked={search.trend === true}
            onChange={(checked) =>
              void navigate({
                to: '.',
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  trend: checked || undefined,
                })) as never,
                replace: true,
              })
            }
          />
        </div>
      )}
    </div>
  );
}
