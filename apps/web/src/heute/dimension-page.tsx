import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { fetchAccounts } from '../ledger/api';
import { LEDGER_KEY } from '../ledger/queries';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { HEUTE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { useMonth } from '../shell/use-month';
import { heuteQuery, type Heute } from './api';
import { useBalancePeriod } from './use-balance-period';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { InvestmentBasisDetails } from './investment-basis';
import './heute.css';

export type DimensionKind = 'liquid' | 'invested' | 'receivable' | 'debt';

export function DimensionPage() {
  useAmountPrivacy();
  const { kind } = useParams({ strict: false }) as { kind: DimensionKind };
  const [month] = useMonth();
  const { period } = useBalancePeriod();
  const query = useQuery(heuteQuery(month, period));
  const net = query.data && !('unavailable' in query.data.netWorth) ? query.data.netWorth : null;
  const location = useLocation();
  const basisHash = REDESIGN_ENABLED && kind === 'invested' && location.hash === 'anlagebasis';
  const navigationKey = location.state.__TSR_key ?? location.href;
  const basisHeading = useRef<HTMLHeadingElement>(null);
  const focusedBasis = useRef<string | undefined>(undefined);
  const names = {
    liquid: 'Liquidität',
    invested: REDESIGN_ENABLED ? 'Anlagen' : 'Investiert',
    receivable: 'Forderungen',
    debt: REDESIGN_ENABLED
      ? net && net.debtCents > 0
        ? 'Guthaben auf Schuldkonten (netto)'
        : 'Schulden (netto)'
      : net && net.debtCents > 0
        ? 'Guthaben auf Schuldkonten'
        : 'Schulden',
  };
  const title = names[kind];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (basisHash) return;
    heading.current?.focus({ preventScroll: true });
  }, [kind, net?.asOf, basisHash]);
  useEffect(() => {
    if (!basisHash) {
      focusedBasis.current = undefined;
      return;
    }
    if (
      query.isPending ||
      query.isFetching ||
      query.isError ||
      !query.data ||
      focusedBasis.current === navigationKey ||
      !basisHeading.current
    )
      return;
    focusedBasis.current = navigationKey;
    basisHeading.current.focus({ preventScroll: true });
    basisHeading.current.scrollIntoView?.({ block: 'start' });
  }, [basisHash, navigationKey, query.isPending, query.isFetching, query.isError, query.data]);
  const search = { monat: month, period };
  return (
    <PageFrame meta={HEUTE} heutePeriod={period} standDay={query.data?.stand.today}>
      <div className="heute">
        <div className="heute-detail-nav">
          <nav aria-label="Brotkrumen">
            <AppLink to="/" search={search}>
              Zurück zu Heute
            </AppLink>
          </nav>
        </div>
        {query.isPending && <LoadingNote what={title} />}
        {query.isError && (
          <ErrorNote what={title} error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.data && !net && (
          <p role="status">
            Bewertung nicht verfügbar.{' '}
            {'unavailable' in query.data.netWorth && query.data.netWorth.unavailable.message}
          </p>
        )}
        {net && (
          <section className="card heute-dimension" aria-labelledby="dimension-title">
            <h2 id="dimension-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
            <NetWorthDetails net={net} kind={kind} />
          </section>
        )}
        {REDESIGN_ENABLED && kind === 'invested' && (
          <InvestmentBasisDetails
            basis={!query.isFetching && !query.isError ? query.data?.investmentBasis : undefined}
            pending={query.isPending || query.isFetching}
            headingRef={basisHeading}
            search={search}
          />
        )}
      </div>
    </PageFrame>
  );
}

function NetWorthDetails({
  net,
  kind,
}: {
  net: Exclude<Heute['netWorth'], { unavailable: unknown }>;
  kind: DimensionKind;
}) {
  useAmountPrivacy();
  const names = {
    liquid: 'Liquidität',
    invested: REDESIGN_ENABLED ? 'Anlagen' : 'Investiert',
    receivable: 'Forderungen',
    debt: REDESIGN_ENABLED
      ? net.debtCents > 0
        ? 'Guthaben auf Schuldkonten (netto)'
        : 'Schulden (netto)'
      : net.debtCents > 0
        ? 'Guthaben auf Schuldkonten'
        : 'Schulden',
  };
  const totals = {
    liquid: net.liquidCents,
    invested: net.investedCents,
    receivable: net.receivableCents,
    debt: net.debtCents,
  };
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'accounts', net.asOf],
    queryFn: () => fetchAccounts(net.asOf),
  });
  const accounts =
    query.data?.accounts.filter((account) => {
      const value = account.valueEurCents;
      if (value === null) return false;
      if (kind === 'debt') return value < 0 || account.role === 'debt';
      if (value < 0 || account.role === 'debt') return false;
      if (kind === 'invested') return account.role === 'investment';
      if (kind === 'receivable') return account.role === 'receivable';
      return account.role === 'budget' || account.role === 'reserve';
    }) ?? [];
  return (
    <div className="heute-breakdown">
      <p>Stand {longDay(net.asOf)}</p>
      {kind === 'liquid' && (
        <p>
          Positive Salden aus Budget- und Reservekonten. Negative Kontosalden zählen zu Schulden;
          das Maß ist kein frei verfügbares Budget.
        </p>
      )}
      {REDESIGN_ENABLED && kind === 'debt' && (
        <p>
          Die Netto-Schuldenkomponente enthält negative Kontosalden und auch positive Guthaben auf
          Konten mit Schuldenrolle. Vermögenswerte (brutto): {eur(net.assetsCents)} ·
          Verbindlichkeiten (brutto): {eur(net.liabilitiesCents)}. Dies ist nicht die Summe der
          Kredite.
        </p>
      )}
      {query.isPending && <LoadingNote what="Konten" />}
      {query.isError && (
        <ErrorNote what="Konten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {query.data &&
        (accounts.length ? (
          <ul>
            {accounts.map((account) => (
              <li key={account.id}>
                <AppLink to={`/konten/${encodeURIComponent(account.id)}`}>{account.name}</AppLink>
                <strong>{eur(account.valueEurCents!)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Keine Konten in diesem Maß.</EmptyNote>
        ))}
      <p className="heute-figure-detail">
        <strong>{kind ? names[kind] : ''}</strong>
        <strong>{kind ? eur(totals[kind]) : ''}</strong>
      </p>
    </div>
  );
}
