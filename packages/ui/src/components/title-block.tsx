import type { ReactNode } from 'react';
import { cx } from './cx';

export interface TitleBlockField {
  label: string;
  value: ReactNode;
}

export interface TitleBlockProps {
  title: ReactNode;
  /** Short sentence next to the title (a question, not a verdict). */
  subtitle?: ReactNode;
  /** Cells with technical lettering, e.g. Stand, Zeitraum. */
  fields?: TitleBlockField[];
  /** Phone: hide title and field labels (the month lives in the app header instead). */
  compactOnMobile?: boolean;
  className?: string;
}

/** Page head as a title block (Schriftfeld): 1 px pale frame, cells split by vertical rules. */
export function TitleBlock({
  title,
  subtitle,
  fields = [],
  compactOnMobile = false,
  className,
}: TitleBlockProps) {
  return (
    <header className={cx('titleblock', compactOnMobile && 'titleblock-compact', className)}>
      <div className="tb-cell tb-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {fields.map((field) => (
        <div className="tb-cell tb-field" key={field.label}>
          <span className="tech tb-label">{field.label}</span>
          <div className="tb-value">{field.value}</div>
        </div>
      ))}
    </header>
  );
}
