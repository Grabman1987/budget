import { Check, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

/** Source stamp (Quellstempel): framed technical lettering. Stale = dashed ink frame. */
export function SourceStamp({ children, stale = false }: { children: ReactNode; stale?: boolean }) {
  return <span className={cx('stamp', stale && 'stamp-stale')}>{children}</span>;
}

export type RuleStatus = 'met' | 'warning' | 'violated';

const STATUS_LABEL: Record<RuleStatus, string> = {
  met: 'erfüllt',
  warning: 'Warnung',
  violated: 'verletzt',
};

export interface StatusMarkProps {
  status: RuleStatus;
  /** Only when the user must act right now the mark turns Rotstift. Otherwise it stays ink. */
  actionNeeded?: boolean;
  children?: ReactNode;
}

/**
 * Status with symbol and text (never colour alone): met = tick, warning/violated = warning sign.
 * Green does not exist as a status colour; a violated value without an acute action stays in ink.
 */
export function StatusMark({ status, actionNeeded = false, children }: StatusMarkProps) {
  const Icon = status === 'met' ? Check : TriangleAlert;
  return (
    <span className={cx('status-mark', `status-${status}`, actionNeeded && 'is-action')}>
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

/** Count mark (Zählmarke). The alert tone counts only items that need action. */
export function Count({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'alert' }) {
  return <span className={cx('count', tone === 'alert' && 'count-alert')}>{children}</span>;
}
