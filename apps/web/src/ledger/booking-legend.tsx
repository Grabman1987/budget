import { StatusCell } from './booking-cells';
import { BOOKING_STATUSES } from './types';
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
    </div>
  );
  if (compact)
    return (
      <KontenMenu
        className="kbooking-legend"
        label="Status"
        icon={<Info size={16} strokeWidth={1.75} aria-hidden="true" />}
        iconOnly
      >
        {body}
      </KontenMenu>
    );
  return (
    <details className="kbooking-legend">
      <summary aria-label="Status">Status</summary>
      {body}
    </details>
  );
}
