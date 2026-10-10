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

export function PaymentPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const payments = useQuery(expectedQuery());
  const payment = payments.data?.find((p) => p.id === id);
  const [month] = useMonth();
  const navigate = useNavigate();
  const { ansicht = 'next', art = 'all' } = useSearch({ strict: false }) as {
    ansicht?: 'next' | 'contracts' | 'all';
    art?: 'all' | 'inflow' | 'outflow';
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [payment?.id]);
  const title = payment?.name ?? 'Wiederkehrende Zahlung';
  return (
    <PageFrame meta={PLAN_ERWARTET} title={title}>
      <div className="xp xp-detail">
        <ExpectedDetailBack title={title} />
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
                  search: { monat: month },
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
