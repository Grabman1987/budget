import { useAmountPrivacy } from '@budget/ui';
import { Repeat2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { type Occurrence } from '../expected/api';
import { AppLink } from '../shell/app-link';
import { nativeCurrency, upcomingDate } from './format';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { cx } from '@budget/ui';

/**
 * Next occurrence of a recurring payment in the "Kommend" preview. Read-only: a tap opens the
 * expected payment, where single dates can be struck, linked or marked as missed.
 */
export function ScheduledRegisterRow({
  occurrence: s,
  today,
  all,
  blankCheck,
  balance,
  showBalance = true,
  phone = false,
}: {
  occurrence: Occurrence;
  today: string;
  all: boolean;
  /** The table has a selection column; scheduled rows leave it empty. */
  blankCheck?: boolean;
  balance: number | null;
  showBalance?: boolean;
  /** Phone: one compact row like a booking row; the whole row opens the expected payment. */
  phone?: boolean;
}) {
  useAmountPrivacy();
  const navigate = useNavigate();
  const to = `/plan/erwartet/${encodeURIComponent(s.paymentId)}`;
  const marker = (
    <span
      className="kstatus-btn kschedule-m-status"
      role="img"
      aria-label="Nächste Wiederholung"
      title="Nächste Wiederholung"
    >
      <Repeat2 size={16} aria-hidden="true" />
    </span>
  );
  if (phone) {
    const category = s.categoryName ?? (s.kind === 'inflow' ? 'Zu verteilen' : 'ohne Kategorie');
    return (
      <tr className="is-upcoming kschedule-phone" data-occurrence={s.occurrenceId}>
        <td colSpan={20}>
          <div className="kschedule-m">
            <AppLink className="kschedule-m-main" to={to}>
              <span className="kschedule-m-line">
                <span className="kschedule-m-name">{s.name}</span>
                <span
                  className={cx(
                    'kschedule-m-amount',
                    s.amountCents < 0 ? 'kupcoming-negative' : 'kupcoming-positive',
                  )}
                >
                  {nativeCurrency(s.amountCents, s.currency, true)}
                </span>
              </span>
              <span className="kschedule-m-line">
                <span className="kschedule-m-meta">
                  {category}
                  {all && <> · {s.accountName}</>}
                </span>
                {showBalance && (
                  <span className="kschedule-m-balance kx-run">
                    {balance === null ? '–' : nativeCurrency(balance, s.currency)}
                  </span>
                )}
              </span>
            </AppLink>
            {marker}
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr
      className="is-upcoming"
      data-occurrence={s.occurrenceId}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('a, button'))
          void navigate({ to: '/plan/erwartet/$id', params: { id: s.paymentId } });
      }}
    >
      {blankCheck && <td className="kc-check kx-check" />}
      <td className="kc-date kx-date">{upcomingDate(s.dueDate, today)}</td>
      <td className="kx-payee">
        <AppLink className="kname-btn kschedule-name" to={to}>
          {s.name}
        </AppLink>
      </td>
      {all ? (
        <td className="kc-acct kx-acct">{s.accountName}</td>
      ) : !REDESIGN_ENABLED ? (
        <td className="kx-note" />
      ) : null}
      <td className="kx-cat">
        {s.categoryName ?? (s.kind === 'inflow' ? 'Zu verteilen' : 'ohne Kategorie')}
      </td>
      {REDESIGN_ENABLED && <td className="kx-note" />}
      <td className={cx('kc-num kx-amount', REDESIGN_ENABLED && 'kx-outgoing')}>
        {(!REDESIGN_ENABLED || s.amountCents < 0) && (
          <span className={s.amountCents < 0 ? 'kupcoming-negative' : 'kupcoming-positive'}>
            {nativeCurrency(s.amountCents, s.currency, true)}
          </span>
        )}
      </td>
      {REDESIGN_ENABLED && (
        <td className="kc-num kx-amount kx-incoming">
          {s.amountCents >= 0 && (
            <span className="kupcoming-positive">
              {nativeCurrency(s.amountCents, s.currency, true)}
            </span>
          )}
        </td>
      )}
      {showBalance && (
        <td className="kc-num kc-run kx-run">
          {balance === null ? (all ? 'Saldo offen' : '–') : nativeCurrency(balance, s.currency)}
        </td>
      )}
      <td className="kc-status kx-status">{marker}</td>
    </tr>
  );
}
