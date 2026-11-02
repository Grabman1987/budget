import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { PLAN_ERWARTET } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { expectedQuery } from './api';
import { ExpectedDetailBack } from './detail-nav';
import { PaymentPanel } from './payment-panel';
import { useMonth } from '../shell/use-month';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { useIsPhone } from '../budget/month-span';
import { ExpectedPage } from './expected-page';
import { PaymentHistoryPreview } from './payment-history-preview';
import { X } from 'lucide-react';

export function PaymentPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const phone = useIsPhone();
  const payments = useQuery(expectedQuery());
  const payment = payments.data?.find((p) => p.id === id);
  const [month] = useMonth();
  const navigate = useNavigate();
  const {
    ansicht = 'next',
    art = 'all',
    tage = 35,
  } = useSearch({ strict: false }) as {
    ansicht?: 'next' | 'contracts' | 'all' | 'kalender';
    art?: 'all' | 'inflow' | 'outflow';
    tage?: 35 | 90;
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [payment?.id]);
  const title = payment?.name ?? 'Wiederkehrende Zahlung';
  const onClose = () =>
    void navigate({
      to: '/plan/erwartet',
      search: { monat: month, ...(REDESIGN_ENABLED ? { ansicht, art, tage } : {}) },
      state: { expectedView: ansicht, expectedKind: art },
    });
  if (REDESIGN_ENABLED && !phone)
    return (
      <ExpectedPage
        selectedId={id}
        detail={
          <aside className="payments-reference-detail card" aria-label="Zahlungsdetail">
            <section className="xp-detail-body" aria-labelledby="payment-title">
              <header>
                <h2 id="payment-title" ref={heading} tabIndex={-1}>
                  {title}
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Zahlungsdetail schließen"
                  onClick={onClose}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>
              {payments.isPending && <LoadingNote what="Wiederkehrende Zahlung" />}
              {payments.isError && (
                <ErrorNote
                  what="Wiederkehrende Zahlung"
                  error={payments.error}
                  onRetry={() => void payments.refetch()}
                />
              )}
              {payments.data && !payment && (
                <p role="status">Diese wiederkehrende Zahlung ist nicht vorhanden.</p>
              )}
              {payment && (
                <>
                  <PaymentHistoryPreview payment={payment} />
                  <details className="payment-reference-management">
                    <summary>Zahlung verwalten</summary>
                    <PaymentPanel state={{ mode: 'view', id }} onClose={onClose} />
                  </details>
                </>
              )}
            </section>
          </aside>
        }
      />
    );
  return (
    <PageFrame meta={PLAN_ERWARTET}>
      <div className="xp xp-detail">
        <ExpectedDetailBack />
        {payments.isPending && <LoadingNote what="Wiederkehrende Zahlung" />}
        {payments.isError && (
          <ErrorNote
            what="Wiederkehrende Zahlung"
            error={payments.error}
            onRetry={() => void payments.refetch()}
          />
        )}
        {payments.data && !payment && (
          <p role="status">Diese wiederkehrende Zahlung ist nicht vorhanden.</p>
        )}
        {payment && (
          <section className="card xp-detail-body" aria-labelledby="payment-title">
            <h2 id="payment-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
            <PaymentPanel
              state={{ mode: 'view', id }}
              onClose={() =>
                void navigate({
                  to: '/plan/erwartet',
                  search: { monat: month, ...(REDESIGN_ENABLED ? { ansicht, art, tage } : {}) },
                  state: { expectedView: ansicht, expectedKind: art },
                })
              }
            />
          </section>
        )}
      </div>
    </PageFrame>
  );
}
