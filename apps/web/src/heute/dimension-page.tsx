import { useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from '@tanstack/react-router';
import { useEffect, useRef, type ReactNode } from 'react';
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
import { LeadExplanation, BudgetExplanation } from './lead-explanation';
import { heuteReturn } from './return-context';
import { ValuationSourceHint } from '../ledger/valuation-hint';
import { ClosedAccountDisclosure } from '../ledger/closed-account-disclosure';
import { HEUTE_DETAILS, detailNames, HeuteHeader, type HeuteDetail } from './overview';
import { HeuteDetailBody } from './heute-page';
import { InvestmentBasisDetails } from './investment-basis';
import './heute.css';

export type NetDimensionKind = 'liquid' | 'invested' | 'receivable' | 'debt';
export type DimensionKind = NetDimensionKind | 'free' | 'budget' | HeuteDetail;

export function DimensionPage() {
  useAmountPrivacy();
  const { kind } = useParams({ strict: false }) as { kind: DimensionKind };
  const [month] = useMonth();
  const { period, setPeriod, paydayAvailable } = useBalancePeriod();
  const query = useQuery(heuteQuery(month, period));
  const matching =
    !query.isPlaceholderData &&
    query.data?.stand.month === month &&
    query.data.stand.period === period;
  const data = REDESIGN_ENABLED
    ? !query.isError && query.failureCount === 0 && matching
      ? query.data
      : undefined
    : query.data;
  const net = data && !('unavailable' in data.netWorth) ? data.netWorth : null;
  const leadKind = kind === 'free' || kind === 'budget';
  const location = useLocation();
  const basisHash = REDESIGN_ENABLED && kind === 'invested' && location.hash === 'anlagebasis';
  const navigationKey = location.state.__TSR_key ?? location.href;
  const basisHeading = useRef<HTMLHeadingElement>(null);
  const focusedBasis = useRef<string | undefined>(undefined);
  const names = {
    ...detailNames,
    free: 'Frei bis Gehalt · Herleitung',
    budget: 'Verfügbar im Budget · Herleitung',
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
  }, [kind, net?.asOf, data?.stand.today, basisHash]);
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
  const back = REDESIGN_ENABLED
    ? heuteReturn(new URL(location.href, 'https://budget.invalid').searchParams.get('von'))
    : undefined;
  const backUrl = new URL(back ?? '/', 'https://budget.invalid');
  return (
    <DimensionFrame
      kind={kind}
      period={period}
      data={data}
      updatedAt={query.dataUpdatedAt}
      setPeriod={setPeriod}
      paydayAvailable={paydayAvailable}
    >
      <div className={`heute${REDESIGN_ENABLED ? ' heute--redesign heute-explanation' : ''}`}>
        <div className="heute-detail-nav">
          <nav aria-label="Brotkrumen">
            <AppLink
              to={backUrl.pathname}
              search={back ? Object.fromEntries(backUrl.searchParams) : search}
              hash={backUrl.hash.slice(1)}
            >
              Zurück zu Heute
            </AppLink>
          </nav>
        </div>
        {REDESIGN_ENABLED && HEUTE_DETAILS.includes(kind as HeuteDetail) && (
          <>
            <h2 ref={heading} tabIndex={-1} className="heute-detail-title">
              {title}
            </h2>
            {query.isFetching && data && (
              <p role="status">
                Heute-Daten werden aktualisiert · Stand {longDay(data.stand.today)}
              </p>
            )}
            <HeuteDetailBody data={data} read={query} period={period} kind={kind as HeuteDetail} />
          </>
        )}
        {query.isPending && (!HEUTE_DETAILS.includes(kind as HeuteDetail) || kind === 'pinned') && (
          <LoadingNote what={title} />
        )}
        {query.isError && kind !== 'pace' && kind !== 'month' && (
          <ErrorNote what={title} error={query.error} onRetry={() => void query.refetch()} />
        )}
        {data && !net && !leadKind && !HEUTE_DETAILS.includes(kind as HeuteDetail) && (
          <p role="status">
            Bewertung nicht verfügbar.{' '}
            {'unavailable' in data.netWorth && data.netWorth.unavailable.message}
          </p>
        )}
        {REDESIGN_ENABLED && leadKind && (data || kind === 'budget') && (
          <section className="card heute-dimension" aria-labelledby="dimension-title">
            <h2 id="dimension-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
            {query.isFetching && data && (
              <p role="status">Stand wird aktualisiert · {longDay(data.stand.today)}</p>
            )}
            {kind === 'free' && data ? (
              <LeadExplanation data={data} />
            ) : (
              <BudgetExplanation month={month} period={period} />
            )}
          </section>
        )}
        {net && !leadKind && !HEUTE_DETAILS.includes(kind as HeuteDetail) && (
          <section className="card heute-dimension" aria-labelledby="dimension-title">
            <h2 id="dimension-title" ref={heading} tabIndex={-1}>
              {title}
            </h2>
            <NetWorthDetails net={net} kind={kind as NetDimensionKind} />
          </section>
        )}
        {REDESIGN_ENABLED && kind === 'invested' && (
          <InvestmentBasisDetails
            basis={data?.investmentBasis}
            pending={query.isPending || (query.isFetching && !data)}
            headingRef={basisHeading}
            search={search}
          />
        )}
      </div>
    </DimensionFrame>
  );
}

function NetWorthDetails({
  net,
  kind,
}: {
  net: Exclude<Heute['netWorth'], { unavailable: unknown }>;
  kind: NetDimensionKind;
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
  const source = useLocation({ select: (location) => location.href });
  const [month] = useMonth();
  const { period } = useBalancePeriod();
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
      <p>
        Stand {longDay(net.asOf)}
        {REDESIGN_ENABLED && ' · EUR · bewertete Kontobeiträge'}
      </p>
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
                <AppLink
                  to={`/konten/${encodeURIComponent(account.id)}`}
                  search={REDESIGN_ENABLED ? { monat: month, period, von: source } : undefined}
                >
                  {account.name}
                </AppLink>
                <strong>{eur(account.valueEurCents!)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>Keine Konten in diesem Maß.</EmptyNote>
        ))}
      {REDESIGN_ENABLED && query.data && !query.isError && (
        <ClosedAccountDisclosure accounts={query.data.accounts} asOf={net.asOf} />
      )}
      {REDESIGN_ENABLED && query.data && (
        <ValuationSourceHint sources={query.data.valuationSources} label={names[kind]} />
      )}
      <p className="heute-figure-detail">
        <strong>{kind ? names[kind] : ''}</strong>
        <strong>{kind ? eur(totals[kind]) : ''}</strong>
      </p>
    </div>
  );
}

function DimensionFrame({
  children,
  kind,
  data,
  period,
  updatedAt,
  setPeriod,
  paydayAvailable,
}: {
  children: ReactNode;
  kind: DimensionKind;
  data: Heute | undefined;
  period: Heute['stand']['period'];
  updatedAt: number;
  setPeriod: (value: Heute['stand']['period']) => void;
  paydayAvailable: boolean;
}) {
  return REDESIGN_ENABLED ? (
    <div className="heute-detail-screen" data-heute-detail={kind}>
      <HeuteHeader
        phone
        data={data}
        updatedAt={updatedAt}
        period={period}
        setPeriod={setPeriod}
        paydayAvailable={paydayAvailable}
      />
      {children}
    </div>
  ) : (
    <PageFrame meta={HEUTE} heutePeriod={period} standDay={data?.stand.today}>
      {children}
    </PageFrame>
  );
}
