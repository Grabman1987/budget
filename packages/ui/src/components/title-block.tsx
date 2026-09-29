import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TitleBlockField {
  label: string;
  value: ReactNode;
  /** Phone: leave this cell out (it is not essential and the strip is narrow). */
  hideOnMobile?: boolean;
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
   * remain (label and value) as a strip. `titleOnMobile` keeps the title cell (month switch).
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
          <span className="tech tb-label">{field.label}</span>
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
export function StandValue({ at, none = 'noch nie' }: { at?: Date | undefined; none?: string }) {
  return (
    <>
      <RefreshCw className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      {at ? (
        <>
          <span className="tb-long">{withDot(longFormat.format(at).replace(/\.,/, '.'))}</span>
          <span className="tb-short">{withDot(shortFormat.format(at))}</span>
        </>
      ) : (
        <span>{none}</span>
      )}
    </>
  );
}
