import { Button } from '@budget/ui';
import { StatusCell } from './booking-cells';
import { STATUS_LABEL } from './labels';
import { BOOKING_STATUSES, type BookingStatus } from './types';

/** Shortcuts for the existing single-status filter, never a second local list filter. */
export function BookingStatusChips({
  value,
  onChange,
}: {
  value: BookingStatus | undefined;
  onChange: (status: BookingStatus | undefined) => void;
}) {
  return (
    <div className="kstatus-chips" role="group" aria-label="Nach Status filtern">
      <Button
        variant="ghost"
        aria-label="Alle Status"
        aria-pressed={!value}
        onClick={() => onChange(undefined)}
      >
        <span className="kstatus-all-full">Alle Status</span>
        <span className="kstatus-all-short">Alle</span>
      </Button>
      {BOOKING_STATUSES.map((status) => (
        <Button
          key={status}
          variant="ghost"
          aria-label={`Status filtern: ${STATUS_LABEL[status]}`}
          aria-pressed={value === status}
          onClick={() => onChange(status)}
        >
          <StatusCell status={status} />
        </Button>
      ))}
    </div>
  );
}
