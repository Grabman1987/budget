import { monthOf, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT_PAGE } from '../nav/pages';
import { AppLink } from '../shell/app-link';
import { PageFrame } from '../pages/placeholder-page';
import { BalanceChart } from './balance-chart';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { BookingTable } from './booking-table';
import { eur, longDay, monthName, pluralBookings } from './format';
import { ACCOUNT_TYPE_LABEL, accountValue, groupOf } from './labels';
import { accountsQuery, bookingsQuery, seriesQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';
import { Button, cx } from '@budget/ui';

const CHART_DAYS = 90;

/** Route component of `/konten/$id`. */
export function AccountRoute() {
  const { id } = useParams({ strict: false }) as { id: string };
  return <AccountPage id={id} />;
}

/** Einzelkonto: figures, 90-day balance line and the bookings of the month with running balance. */
export function AccountPage({ id }: { id: string }) {
  const accounts = useQuery(accountsQuery());
  const account = accounts.data?.accounts.find((a) => a.id === id);
  return (
    <PageFrame meta={ACCOUNT_PAGE} title={account?.name ?? 'Konto'}>
      <section className="kacct">
        <Link className="kback" to="/konten">
          <ChevronLeft className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
          Übersicht
        </Link>
        {accounts.isPending && <LoadingNote what="Konto" />}
        {accounts.isError && (
          <ErrorNote what="Konto" error={accounts.error} onRetry={() => void accounts.refetch()} />
        )}
        {accounts.data && !account && (
          <EmptyNote
            action={
              <Link className="btn btn-ghost btn-sm" to="/konten">
                Zur Übersicht
              </Link>
            }
          >
            Dieses Konto gibt es nicht (mehr).
          </EmptyNote>
        )}
        {account && <AccountBody account={account} />}
      </section>
    </PageFrame>
  );
}

function AccountBody({ account }: { account: AccountRow }) {
  const today = todayInVienna();
  const month = monthOf(today);
  const series = useQuery(seriesQuery(account.id, CHART_DAYS));
  const list = useQuery(
    bookingsQuery({ accountId: account.id, from: `${month}-01` }, undefined, 200),
  );
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const value = accountValue(account);
  const page = list.data;

  return (
    <>
      <div className="kacct-head">
        <div>
          <h2>{account.name}</h2>
          <p className="kmeta">
            {ACCOUNT_TYPE_LABEL[account.type]} · {groupOf(account.role).title}
            {account.closedAt && <span>geschlossen am {longDay(account.closedAt)}</span>}
          </p>
        </div>
        <div className="kacct-actions">
          {!account.closedAt && (
            <Button onClick={() => setPanel({ mode: 'create', accountId: account.id })}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Buchung erfassen
            </Button>
          )}
        </div>
      </div>
      <div className="kfigs">
        <div className="fig">
          <small>Saldo</small>
          <strong className={cx(value < 0 && 'neg')} data-testid="account-balance">
            {eur(value)}
          </strong>
        </div>
        <div className="fig">
          <small>davon vorgemerkt</small>
          <strong className="muted">{eur(account.unclearedCents)}</strong>
        </div>
        <div className="fig">
          <small>{monthName(today)}</small>
          <strong className="muted">{page ? eur(page.sumCents, { sign: true }) : '–'}</strong>
        </div>
        <div className="fig">
          <small>zuletzt geprüft</small>
          <strong className="muted">
            {account.lastReconciledOn ? longDay(account.lastReconciledOn) : '—'}
          </strong>
        </div>
      </div>
      {series.isPending && <LoadingNote what="Saldoverlauf" />}
      {series.isError && (
        <ErrorNote what="Saldoverlauf" error={series.error} onRetry={() => void series.refetch()} />
      )}
      {series.data && (
        <>
          <BalanceChart points={series.data.points} windowLabel={`${CHART_DAYS} Tage`} />
          <div className="legend" aria-hidden="true">
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-actual" d="M0 4h26" />
              </svg>
              Saldo
            </span>
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-plan" d="M0 4h26" />
              </svg>
              0 € · {account.type === 'checking' ? 'darunter beginnt der Dispo' : 'Nulllinie'}
            </span>
          </div>
        </>
      )}
      <div className="head kh">
        <h2>Buchungen · {monthName(today)}</h2>
        {page && <span className="aside">{pluralBookings(page.total)}</span>}
      </div>
      {list.isPending && <LoadingNote what="Buchungen" />}
      {list.isError && (
        <ErrorNote what="Buchungen" error={list.error} onRetry={() => void list.refetch()} />
      )}
      {page && page.items.length === 0 && (
        <EmptyNote>Keine Buchungen im {monthName(today)}.</EmptyNote>
      )}
      {page && page.items.length > 0 && (
        <BookingTable
          items={page.items}
          caption="Buchungen mit laufendem Saldo"
          variant="account"
          onOpen={(booking) => setPanel({ mode: 'edit', booking })}
        />
      )}
      {page?.nextCursor && (
        <p className="ksum">
          Weitere Buchungen stehen unter <AppLink to="/konten/buchungen">Alle Buchungen</AppLink>.
        </p>
      )}
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </>
  );
}
