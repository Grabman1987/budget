import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TitleBlockField {
  label: string;
  value: ReactNode;
  /** Phone: leave this cell out (it is not essential and the strip is narrow). */
  hideOnMobile?: boolean;
  /**
   * Phone: keep the label visible. By default the strip shows values only, as in the prototype
   * (an icon or a control says what the cell is); fields whose value alone is ambiguous keep it.
   */
  labelOnMobile?: boolean;
}

export interface TitleBlockProps {
  /** The title; may carry controls (month switch with previous/next buttons). */
  title: ReactNode;
  /** Short line next to the title. Only Reports use one (count or group name); other areas do not. */
  subtitle?: ReactNode;
  /** Cells with technical lettering, e.g. Stand, Zeitraum. */
  fields?: TitleBlockField[];
  /**
   * Phone: the app header carries the title, so the title cell is hidden and only the fields
   * remain as a strip (values; labels only where `labelOnMobile` is set, otherwise for screen
   * readers). `titleOnMobile` keeps the title cell (month switch). A strip without any visible
   * cell is not shown at all.
   */
  compactOnMobile?: boolean;
  titleOnMobile?: boolean;
  className?: string;
}

/** Page head as a title block (Schriftfeld): 1 px pale frame, cells split by vertical rules. */
export function TitleBlock({
  title,
  subtitle,
  fields = [],
  compactOnMobile = false,
  titleOnMobile = false,
  className,
}: TitleBlockProps) {
  return (
    <header
      className={cx(
        'titleblock',
        compactOnMobile && 'titleblock-compact',
        titleOnMobile && 'titleblock-title-mobile',
        className,
      )}
    >
      <div className="tb-cell tb-title">
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        {subtitle && <p>{subtitle}</p>}
      </div>
      {fields.map((field) => (
        <div
          className={cx('tb-cell', 'tb-field', field.hideOnMobile && 'tb-hide-mobile')}
          key={field.label}
        >
          <span className={cx('tech', 'tb-label', field.labelOnMobile && 'tb-label-mobile')}>
            {field.label}
          </span>
          <div className="tb-value">{field.value}</div>
        </div>
      ))}
    </header>
  );
}

const longFormat = new Intl.DateTimeFormat('de-AT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const longDayFormat = new Intl.DateTimeFormat('de-AT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDayFormat = new Intl.DateTimeFormat('de-AT', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const shortFormat = new Intl.DateTimeFormat('de-AT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** "17.09.2026 06:30" style pieces joined with a middle dot, as in the prototype. */
const withDot = (formatted: string) => formatted.replace(/,?\s(?=\d{2}:\d{2}$)/, ' · ');

/**
 * Value of the "Stand" cell: when the data was last synchronised. Long form on desktop
 * ("Do 17.09.2026 · 06:30"), short form on the phone ("17.09. · 06:30"). Without a date (nothing
 * synchronised yet) it says so instead of showing a made-up time.
 */
export function StandValue({
  at,
  day,
  label,
  none = 'noch nie',
}: {
  at?: Date | undefined;
  /** Only the day is known (`YYYY-MM-DD`): shown without a time. */
  day?: string | undefined;
  /** Names what the stamp is about, put before the time in the long form ("Kurse 06:30"). */
  label?: string | undefined;
  none?: string;
}) {
  const stamp = at ?? (day ? new Date(`${day}T12:00:00Z`) : undefined);
  const long = (stamp: Date) => {
    // "Do. 17.09.2026" -> "Do 17.09.2026", as in the prototype.
    const text = (at ? longFormat : longDayFormat)
      .format(stamp)
      .replace(/\.,/, '.')
      .replace(/^(\p{L}+)\./u, '$1');
    const dotted = at ? withDot(text) : text;
    return label ? (at ? dotted.replace(' · ', ` · ${label} `) : `${dotted} · ${label}`) : dotted;
  };
  return (
    <>
      <RefreshCw className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      {stamp ? (
        <>
          <span className="tb-long">{long(stamp)}</span>
          <span className="tb-short">
            {at ? withDot(shortFormat.format(stamp)) : shortDayFormat.format(stamp)}
          </span>
        </>
      ) : (
        <span>{none}</span>
      )}
    </>
  );
}
