import { StatusCell } from './booking-cells';
import { FLAG_SHAPES, FlagGlyph } from './flag-picker';
import { FLAG_LABEL } from './labels';
import { BOOKING_FLAGS, BOOKING_STATUSES } from './types';
import { Info } from 'lucide-react';
import { KontenMenu } from './konten-menu';
import type { ReactNode } from 'react';

/** One-click explanation shared by the account and all-bookings registers. */
export function BookingLegend({
  compact = false,
  context,
}: {
  compact?: boolean;
  context?: ReactNode;
}) {
  const body = (
    <div className="kbooking-legend-body">
      {context}
      <ul aria-label="Buchungsstatus">
        {BOOKING_STATUSES.map((status) => (
          <li key={status}>
            <StatusCell status={status} />
          </li>
        ))}
      </ul>
      <ul aria-label="Markierungen">
        {BOOKING_FLAGS.map((flag) => (
          <li key={flag}>
            <FlagGlyph flag={flag} named={false} />
            <span>
              {FLAG_LABEL[flag]} · {FLAG_SHAPES[flag].label}
            </span>
          </li>
        ))}
        <li>
          <FlagGlyph flag="" named={false} />
          <span>keine Markierung</span>
        </li>
      </ul>
    </div>
  );
  if (compact)
    return (
      <KontenMenu
        className="kbooking-legend"
        label="Status und Markierungen"
        icon={<Info size={16} strokeWidth={1.75} aria-hidden="true" />}
        iconOnly
      >
        {body}
      </KontenMenu>
    );
  return (
    <details className="kbooking-legend">
      <summary aria-label="Status und Markierungen">
        <span className="klegend-full">Status und Markierungen</span>
        <span className="klegend-short">Markierungen</span>
      </summary>
      {body}
    </details>
  );
}
