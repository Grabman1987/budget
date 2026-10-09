import { Button, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { Period } from '@budget/domain';
import { VERMOEGEN_PORTFOLIO_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AppLink } from '../shell/app-link';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { instrumentQuery, instrumentsQuery, portfolioPositionsQuery } from './portfolio-api';
import { InstrumentPanel } from './portfolio-panel';
import { TradePanel } from './trade-panel';
import { savingsPlansQuery } from './savings-api';
import { SavingsHistory, SavingsPanel } from './savings-panel';
import { BANK_NOTE } from './savings-model';
import './portfolio.css';
import './savings.css';

function PortfolioDetailBack({ title }: { title: string }) {
  const router = useRouter();
  const openedInApp = useLocation({ select: (location) => location.state.wealthDetailOpenedInApp });
  const { zeitraum } = useSearch({ strict: false }) as { zeitraum?: Period };
  return (
    <div className="portfolio-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink to="/vermoegen/nettovermoegen" search={{ zeitraum }}>
          Vermögen
        </AppLink>
        {' › '}
        <AppLink to="/vermoegen/portfolio" search={{ zeitraum }}>
          Portfolio
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <AppLink
        to="/vermoegen/portfolio"
        search={{ zeitraum }}
        onClick={(event) => {
          if (openedInApp && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            router.history.back();
          }
        }}
      >
        Zurück zum Portfolio
      </AppLink>
    </div>
  );
}

export function InstrumentPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const { handel, zeitraum } = useSearch({ strict: false }) as {
    handel?: string;
    zeitraum?: Period;
  };
  const navigate = useNavigate();
  const router = useRouter();
  const state = useLocation({ select: (location) => location.state });
  const instrument = useQuery(instrumentQuery(id));
  const positions = useQuery(portfolioPositionsQuery());
  const view = positions.data;
  const select = (securityId?: string) => {
    if (securityId === id) {
      if (handel) trade();
      return;
    }
    void navigate(
      securityId
        ? {
            to: '/vermoegen/portfolio/instrument/$id',
            params: { id: securityId },
            search: { zeitraum },
            state: { wealthDetailOpenedInApp: state.wealthDetailOpenedInApp === true },
            replace: !!handel,
          }
        : { to: '/vermoegen/portfolio', search: { zeitraum } },
    );
  };
  const trade = (target?: string) => {
    if (!target && !handel) return;
    if (!target && state.panelOpenedInApp) {
      router.history.back();
      return;
    }
    void navigate({
      to: '/vermoegen/portfolio/instrument/$id',
      params: { id },
      search: { zeitraum, handel: target },
      state: {
        wealthDetailOpenedInApp: state.wealthDetailOpenedInApp === true,
        panelOpenedInApp: !!target,
      },
      replace: !target,
    });
  };
  const title = instrument.data?.security.name ?? 'Instrument';
  return (
    <PageFrame meta={VERMOEGEN_PORTFOLIO_META} title={title}>
      <div className="portfolio-detail">
        <PortfolioDetailBack title={title} />
        <InstrumentPanel
          key={id}
          id={id}
          position={(view?.positions ?? view?.classes.flatMap((g) => g.positions) ?? []).find(
            (p) => p.securityId === id,
          )}
          asOf={view?.asOf}
          positionState={
            positions.isError ? 'unavailable' : positions.isPending ? 'loading' : 'ready'
          }
          onRetryPositions={() => void positions.refetch()}
          onClose={() => select()}
          onSelect={select}
          onTrade={trade}
        />
      </div>
      <TradePanel id={handel ?? ''} securityId={id} onClose={() => trade()} onSaved={select} />
    </PageFrame>
  );
}

export function SavingsPlanPage() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  const plans = useQuery(savingsPlansQuery());
  const accounts = useQuery(accountsQuery());
  const instruments = useQuery(instrumentsQuery());
  const [editing, setEditing] = useState<'edit' | 'end' | null>(null);
  const formOpener = useRef<HTMLButtonElement>(null);
  const ready = plans.data && accounts.data && instruments.data;
  const loaded = !!ready;
  const plan = plans.data?.plans.find((p) => p.id === id);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [plan?.id, loaded]);
  const name =
    instruments.data?.securities.find((s) => s.id === plan?.securityId)?.name ?? 'Sparplan';
  return (
    <PageFrame meta={VERMOEGEN_PORTFOLIO_META} title={`Sparplan · ${name}`}>
      <div className="portfolio-detail">
        <PortfolioDetailBack title={`Sparplan · ${name}`} />
        {[
          { query: plans, what: 'Sparpläne' },
          { query: accounts, what: 'Konten' },
          { query: instruments, what: 'Instrumente' },
        ]
          .filter(({ query }) => query.isPending || query.isError)
          .map(({ query, what }) => (
            <div key={what}>
              {query.isPending && <LoadingNote what={what} />}
              {query.isError && (
                <ErrorNote what={what} error={query.error} onRetry={() => void query.refetch()} />
              )}
            </div>
          ))}
        {ready && !plan && (
          <p role="alert">
            Dieser Sparplan ist nicht verfügbar. Bitte den Verlauf in der Liste öffnen.
          </p>
        )}
        {ready && plan && (
          <section aria-label="Sparplandetails">
            <h2 tabIndex={-1} ref={heading}>
              {name}
            </h2>
            <p className="vnote">{BANK_NOTE}</p>
            <p>
              <AppLink to={`/konten/${encodeURIComponent(plan.accountId)}`}>
                {accounts.data.accounts.find((a) => a.id === plan.accountId)?.name ??
                  'Anlagekonto öffnen'}
              </AppLink>
              {' · '}Diese Version: {longDay(plan.validFrom)} bis{' '}
              {plan.validTo ? longDay(plan.validTo) : 'offen'}.
            </p>
            {plan.validTo === null && (
              <div className="savings-actions">
                <Button
                  variant="ghost"
                  onClick={(event) => {
                    formOpener.current = event.currentTarget;
                    setEditing('edit');
                  }}
                >
                  Sparplan bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  onClick={(event) => {
                    formOpener.current = event.currentTarget;
                    setEditing('end');
                  }}
                >
                  Sparplan beenden
                </Button>
              </div>
            )}
            <SavingsHistory
              plan={plan}
              plans={plans.data.plans}
              accounts={accounts.data.accounts}
            />
          </section>
        )}
      </div>
      {editing && ready && plan && (
        <SavingsPanel
          key={`${id}:${editing}`}
          id={id}
          plans={plans.data.plans}
          accounts={accounts.data.accounts}
          securities={instruments.data.securities}
          today={accounts.data.asOf}
          initiallyEnding={editing === 'end'}
          onClose={() => {
            setEditing(null);
            requestAnimationFrame(() => {
              const target = formOpener.current?.isConnected ? formOpener.current : heading.current;
              target?.focus({ preventScroll: true });
            });
          }}
        />
      )}
    </PageFrame>
  );
}
