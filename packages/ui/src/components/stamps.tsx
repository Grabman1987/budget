import {
  ArrowUp,
  ChartPie,
  Check,
  CheckCheck,
  CreditCard,
  Lock,
  Minus,
  TriangleAlert,
} from 'lucide-react';
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
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export type BudgetPresentationState = 'met' | 'open' | 'overspent' | 'overfunded' | 'neutral';

const BUDGET_MARKS = {
  met: { Icon: Check, label: 'Ziel erfüllt' },
  open: { Icon: ChartPie, label: 'Offen' },
  overspent: { Icon: CreditCard, label: 'Überzogen' },
  overfunded: { Icon: ArrowUp, label: 'Mehr als Ziel' },
  neutral: { Icon: Minus, label: 'Null / pausiert' },
} as const;

/** Opt-in presentation of an existing result; no amounts, thresholds or state transitions. */
export function BudgetStateMark({
  state,
  children,
}: {
  state: BudgetPresentationState;
  children?: ReactNode;
}) {
  const { Icon, label } = BUDGET_MARKS[state];
  return (
    <span className={cx('budget-state', `budget-state-${state}`)}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {children ?? label}
    </span>
  );
}

/** Decorative glyph only; the caller retains its existing native control and accessible name. */
export function BookingStatusIcon({
  status,
  className,
}: {
  status: 'pending' | 'confirmed' | 'reconciled';
  className?: string;
}) {
  const name = cx('booking-status-icon', `booking-status-${status}`, className);
  if (status === 'pending')
    return (
      <svg className={name} width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx={8} cy={8} r={7.1} fill="none" stroke="currentColor" strokeWidth={1.3} />
        <path
          d="M9.6 6.4a2.3 2.3 0 1 0 0 3.2"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.3}
        />
      </svg>
    );
  const Icon = status === 'confirmed' ? CheckCheck : Lock;
  return <Icon className={name} size={16} strokeWidth={1.75} aria-hidden="true" />;
}

export interface CountProps {
  children: ReactNode;
  tone?: 'ink' | 'alert';
  /**
   * Text for screen readers that is appended to the number (visually hidden), so the badge does
   * not rely on its colour. Default: " offen" for the alert tone, nothing for ink. Pass "" to
   * suppress, or e.g. " ungelesen" when "offen" does not fit.
   */
  srSuffix?: string;
}

/** Count mark (Zählmarke). The alert tone counts only items that need action. */
export function Count({ children, tone = 'ink', srSuffix }: CountProps) {
  const suffix = srSuffix ?? (tone === 'alert' ? ' offen' : '');
  return (
    <span className={cx('count', tone === 'alert' && 'count-alert')}>
      {children}
      {suffix && <span className="sr-only">{suffix}</span>}
    </span>
  );
}
