import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import './report-table.css';

/** Shared register-style table. Callers keep semantic headers, figures and drilldowns. */
export const ReportTable = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<'table'> & {
    caption: string;
    regionLabel: string;
    scrollClassName?: string;
  }
>(function ReportTable(
  { caption, regionLabel, className = '', scrollClassName = '', children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`report-table-scroll rscroll rsticky ${scrollClassName}`}
      role="region"
      aria-label={regionLabel}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll the complete table.
      tabIndex={0}
    >
      <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
      <table {...props} className={`report-table ${className}`}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
});
