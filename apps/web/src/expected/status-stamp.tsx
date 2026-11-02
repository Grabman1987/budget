import { Ban, Check, Clock, TriangleAlert, X } from 'lucide-react';
import type { OccurrenceStatus } from './api';
import { STATUS_LABEL } from './expected-model';

/**
 * The status as a stamp: symbol and word, red only when the owner has to act. "Gestrichen" is a
 * deliberate plan change, so it stays neutral.
 */
export function StatusStamp({
  status,
  alert,
  compact = false,
}: {
  status: OccurrenceStatus;
  alert: boolean;
  compact?: boolean;
}) {
  const Icon =
    status === 'received'
      ? Check
      : status === 'expected'
        ? Clock
        : status === 'missed'
          ? X
          : status === 'skipped'
            ? Ban
            : TriangleAlert;
  return (
    <span
      className={alert ? 'xp-status is-alert' : 'xp-status'}
      title={compact ? STATUS_LABEL[status] : undefined}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {compact ? <span className="sr-only">{STATUS_LABEL[status]}</span> : STATUS_LABEL[status]}
    </span>
  );
}
