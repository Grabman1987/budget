import { StatusCell } from './booking-cells';
import { FLAG_SHAPES, FlagGlyph } from './flag-picker';
import { FLAG_LABEL } from './labels';
import { BOOKING_FLAGS, BOOKING_STATUSES } from './types';

/** One-click explanation shared by the account and all-bookings registers. */
export function BookingLegend() {
  return (
    <details className="kbooking-legend">
      <summary aria-label="Status und Markierungen">
        <span className="klegend-full">Status und Markierungen</span>
        <span className="klegend-short">Markierungen</span>
      </summary>
      <div className="kbooking-legend-body">
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
    </details>
  );
}
