import { SavingsV3 } from './savings-v3';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { SavingsExecutions } from './savings-executions';
import { matchesAsset, type AssetType } from './redesign-filters';
import { WealthReadStatus } from './redesign-frame';
import { useAmountPrivacy, Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import type { Period } from '@budget/domain';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote, EmptyNote } from '../ledger/states';
import { longDay, nativeCurrency } from '../ledger/format';
import { instrumentsQuery } from './portfolio-api';
import { savingsPlansQuery } from './savings-api';
import { BANK_NOTE, currentRates, planGroups } from './savings-model';
import { SavingsPanel } from './savings-panel';
import './savings.css';
import { FundingPlanner } from './funding-plan';
import { PortfolioStrategySection } from './strategy-page';

export function SavingsSection({
  navigationPath = '/vermoegen/portfolio',
  art = 'alle',
}: {
  navigationPath?: '/vermoegen/portfolio' | '/vermoegen/portfolio/sparplaene';
  art?: AssetType;
}) {
  useAmountPrivacy();
  const plans = useQuery(savingsPlansQuery());
  const accounts = useQuery(accountsQuery());
  const instruments = useQuery(instrumentsQuery());
  const search = useSearch({ strict: false }) as {
    sparplan?: string;
    zeitraum?: Period;
    fokus?: string;
  };
  const navigate = useNavigate();
  const [includeEnded, setIncludeEnded] = useState(false);
  const captureTrigger = useRef<HTMLButtonElement | null>(null);
  const select = (sparplan?: string, trigger?: HTMLButtonElement) => {
    if (trigger) captureTrigger.current = trigger;
    void navigate({
      to: sparplan && sparplan !== 'neu' ? '/vermoegen/portfolio/sparplan/$id' : navigationPath,
      params: { id: sparplan ?? '' },
      state: { wealthDetailOpenedInApp: true },
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        sparplan: sparplan === 'neu' ? sparplan : undefined,
        fokus: sparplan ? prev['fokus'] : undefined,
        produkt: undefined,
        handel: undefined,
        allokation: undefined,
      })) as never,
    }).then(() => {
      if (sparplan || !search.sparplan || search.fokus === 'investment') return;
      // Closing navigation can remount the route and detach the dialog's native opener.
      requestAnimationFrame(() => {
        if (document.querySelector('dialog[open]')) return;
        if (REDESIGN_ENABLED && captureTrigger.current?.isConnected) {
          captureTrigger.current.focus();
          captureTrigger.current = null;
          return;
        }
        // The dialog restores its captured trigger when it survived navigation. Keep that
        // trigger, including the version-list action; only a detached opener needs a fallback.
        if (
          REDESIGN_ENABLED &&
          document.activeElement instanceof HTMLButtonElement &&
          document.activeElement.closest('.savings-section')
        )
          return;
        const opener = document.querySelector<HTMLButtonElement>(
          `[data-savings-plan="${CSS.escape(search.sparplan!)}"]`,
        );
        const fallback = document.querySelector<HTMLButtonElement>('[data-savings-plan="neu"]');
        (opener?.isConnected ? opener : fallback)?.focus();
      });
    });
  };
  const ready = plans.data && accounts.data && instruments.data;
  const groups = ready
    ? planGroups(plans.data.plans, accounts.data.asOf).filter((group) => {
        const security = instruments.data.securities.find(
          (item) => item.id === group.latest.securityId,
        );
        return (
          !REDESIGN_ENABLED || art === 'alle' || (!!security && matchesAsset(security.kind, art))
        );
      })
    : [];
  const endedCount = groups.filter(
    (group) => !group.effective.length && !group.future.length,
  ).length;
  const visibleGroups = groups.filter(
    (group) => includeEnded || group.effective.length || group.future.length,
  );
  const totals = currentRates(groups, accounts.data?.accounts ?? []);
  return (
    <section
      className="savings-section"
      aria-label={REDESIGN_ENABLED ? 'Sparpläne' : undefined}
      aria-labelledby={REDESIGN_ENABLED ? undefined : 'savings-title'}
    >
      {!REDESIGN_ENABLED && (
        <div className="head">
          <h2 id="savings-title">Sparpläne</h2>
          <span className="aside">
            {[...totals]
              .map(([currency, amount]) =>
                amount === null
                  ? `${currency}: Summe nicht verfügbar`
                  : `${nativeCurrency(amount, currency)} / Monat`,
              )
              .join(' · ')}
          </span>
        </div>
      )}
      {[
        { query: plans, what: 'Sparpläne' },
        { query: accounts, what: 'Konten' },
        { query: instruments, what: 'Instrumente' },
      ].map(({ query, what }) => (
        <div key={what}>
          {query.isPending && <LoadingNote what={what} />}
          {query.isError && (
            <ErrorNote what={what} error={query.error} onRetry={() => void query.refetch()} />
          )}
        </div>
      ))}
      {REDESIGN_ENABLED && ready && (
        <SavingsV3
          groups={visibleGroups}
          accounts={accounts.data.accounts}
          securities={instruments.data.securities}
          today={accounts.data.asOf}
          onSelect={select}
        />
      )}
      <SavingsScheduleDetails>
        {ready && (
          <>
            {groups.some((group) => group.ambiguous) && (
              <p className="vnote" role="status">
                Mehrere Versionen gelten gleichzeitig. Die heutige Rate und die betroffene
                Monatssumme sind nicht eindeutig. Bitte den Verlauf prüfen.
              </p>
            )}
            {groups.some(
              (group) =>
                group.effective.length &&
                !accounts.data.accounts.some((a) => a.id === group.latest.accountId),
            ) && (
              <p className="vnote" role="status">
                Mindestens ein Anlagekonto ist nicht verfügbar. Währung und vollständige
                Monatssummen können nicht bestimmt werden.
              </p>
            )}
            {!visibleGroups.length ? (
              <EmptyNote>
                {groups.length
                  ? 'Keine laufenden oder vorgemerkten Sparpläne.'
                  : REDESIGN_ENABLED && art !== 'alle'
                    ? 'Keine Sparpläne für diese Anlageart.'
                    : 'Noch keine Sparpläne angelegt.'}
              </EmptyNote>
            ) : (
              <table className="ktable savings-table">
                <caption className="sr-only">
                  Sparpläne mit heutiger Rate und vorgemerkten Änderungen
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Produkt / Konto</th>
                    <th scope="col" className="num">
                      Rate heute
                    </th>
                    <th scope="col">Vorgemerkt / Gültigkeit</th>
                    <th scope="col">Quelle heute</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group) => {
                    const row = group.editable ?? group.latest;
                    const account = accounts.data.accounts.find((a) => a.id === row.accountId);
                    const name =
                      instruments.data.securities.find((s) => s.id === row.securityId)?.name ??
                      'Nicht verfügbares Instrument';
                    const current = group.current;
                    return (
                      <tr key={row.id}>
                        <td>
                          <button
                            type="button"
                            data-savings-plan={REDESIGN_ENABLED ? undefined : row.id}
                            className="portfolio-product"
                            onClick={() => select(row.id)}
                          >
                            {name}
                          </button>
                          <small>{account?.name ?? 'Nicht verfügbares Konto'}</small>
                        </td>
                        <td className="num" data-label="Rate heute">
                          {group.ambiguous ? (
                            <>
                              Nicht eindeutig
                              {group.effective.map((version) => (
                                <small key={version.id}>
                                  {account
                                    ? nativeCurrency(version.amountCents, account.currency)
                                    : 'Währung unbekannt'}{' '}
                                  · ab {longDay(version.validFrom)}
                                  {version.validTo && ` bis ${longDay(version.validTo)}`}
                                </small>
                              ))}
                            </>
                          ) : current && account ? (
                            nativeCurrency(current.amountCents, account.currency)
                          ) : (
                            '—'
                          )}
                          {current && <small>am {current.dayOfMonth}.</small>}
                        </td>
                        <td data-label="Gültigkeit">
                          {group.future.map((future) => (
                            <div key={future.id}>
                              {account
                                ? nativeCurrency(future.amountCents, account.currency)
                                : 'Währung unbekannt'}{' '}
                              ab {longDay(future.validFrom)}
                              <small>
                                am {future.dayOfMonth}.
                                {future.validTo && ` · bis ${longDay(future.validTo)}`}
                              </small>
                            </div>
                          ))}
                          {!group.future.length &&
                            (group.ambiguous
                              ? 'Überlappende Versionen · Verlauf öffnen'
                              : current
                                ? `Seit ${longDay(current.validFrom)}${current.validTo ? ` · bis ${longDay(current.validTo)}` : ''}`
                                : 'Beendet · Verlauf öffnen')}
                        </td>
                        <td data-label="Quelle">
                          {group.ambiguous
                            ? 'Nicht eindeutig'
                            : current?.sourceAccountId
                              ? (accounts.data.accounts.find(
                                  (a) => a.id === current.sourceAccountId,
                                )?.name ?? 'Nicht verfügbares Konto')
                              : current
                                ? 'Nicht hinterlegt'
                                : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div className="savings-actions">
              <Button
                data-savings-plan={REDESIGN_ENABLED ? undefined : 'neu'}
                onClick={(event) => select('neu', event.currentTarget)}
              >
                Sparplan anlegen
              </Button>
              {endedCount > 0 && (
                <Button variant="ghost" onClick={() => setIncludeEnded(!includeEnded)}>
                  {includeEnded
                    ? 'Beendete Sparpläne ausblenden'
                    : `Beendete Sparpläne anzeigen (${endedCount})`}
                </Button>
              )}
            </div>
          </>
        )}
      </SavingsScheduleDetails>
      {REDESIGN_ENABLED && (
        <>
          <WealthReadStatus
            fetching={plans.isFetching}
            paused={plans.isPaused}
            date={accounts.data ? longDay(accounts.data.asOf) : undefined}
          />
          <details className="wealth-details">
            <summary>Ausführungen prüfen</summary>
            <SavingsExecutions />
          </details>
        </>
      )}
      <p className="vnote">{BANK_NOTE}</p>
      <FundingPlanner />
      {REDESIGN_ENABLED && <PortfolioStrategySection />}
      {search.sparplan && ready && (
        <SavingsPanel
          key={search.sparplan}
          id={search.sparplan}
          plans={plans.data.plans}
          accounts={accounts.data.accounts}
          securities={instruments.data.securities}
          today={accounts.data.asOf}
          onClose={() => select()}
        />
      )}
    </section>
  );
}

function SavingsScheduleDetails({ children }: { children: React.ReactNode }) {
  return REDESIGN_ENABLED ? (
    <details className="wealth-details">
      <summary>Zeitpläne, Versionen und beendete Sparpläne</summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
