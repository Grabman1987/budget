import { Check, Clock, TriangleAlert, X } from 'lucide-react';
import type { OccurrenceStatus } from './api';
import { STATUS_LABEL } from './expected-model';

/** The status as a stamp: symbol and word, red only when the owner has to act. */
export function StatusStamp({ status, alert }: { status: OccurrenceStatus; alert: boolean }) {
  const Icon =
    status === 'received'
      ? Check
      : status === 'expected'
        ? Clock
        : status === 'missed'
          ? X
          : TriangleAlert;
  return (
    <span className={alert ? 'xp-status is-alert' : 'xp-status'}>
      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
