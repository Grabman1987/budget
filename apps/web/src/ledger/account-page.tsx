import { AccountFreshness } from './account-freshness';
import { BankBalance } from './bank-balance';
import { useAmountPrivacy, Button, Segmented, Select, Field, cx } from '@budget/ui';
import {
  addMonths,
  DEFAULT_FUTURE_PREVIEW_DAYS,
  calendarRangeWindow,
  isCalendarRange,
  lastDayOfMonth,
  monthOf,
  type Period,
  type LiquidityHorizon,
  type LiquidityLeverId,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT_PAGE } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { BalanceChart } from './balance-chart';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { AccountRegister } from './account-register';
import { useRegisterToday } from './upcoming-register';
import {
  eur,
  longDay,
  monthName,
  nativeCurrency,
  valuedCurrency,
  valuedCurrencyParts,
  valuedMovement,
} from './format';
import { ACCOUNT_TYPE_LABEL, accountValueEur, groupOf, valuationMissingText } from './labels';
import { fetchSeries } from './api';
import { displaySettingsQuery } from '../pages/future-preview-setting';
import { PeriodQuickSelect } from '../reports/period-quick-select';
import { accountsQuery, bookingsQuery } from './queries';
import { AccountReview } from './account-review';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';
import { useLiquiditySelection } from '../reports/liquidity-selection';
import { AppLink } from '../shell/app-link';
import { DepotBody } from './depot-page';

/** Route component of `/konten/$id`. */
export function AccountRoute() {
  useAmountPrivacy();
  const { id } = useParams({ strict: false }) as { id: string };
  return <AccountPage id={id} />;
}

/** Einzelkonto: figures, balance line and continuous history with running balance. */
export function AccountPage({ id }: { id: string }) {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const account = accounts.data?.accounts.find((a) => a.id === id);
  const bankBalance =
    accounts.isError || !account || account.closedAt ? undefined : account.bankBalance;
  return (
    <PageFrame
      meta={ACCOUNT_PAGE}
      title={account?.name ?? 'Konto'}
      accountFields={[
        {
          label: 'Bankstand vom',
          value: bankBalance?.date ? longDay(bankBalance.date) : 'Unbekannt',
          labelOnMobile: true,
        },
        {
          label: 'Bank-Sync',
          value:
            bankBalance === null
              ? 'Nicht eingerichtet'
              : bankBalance
                ? bankBalance.fetchedAt
                  ? 'Abruf gespeichert'
                  : 'Abruf unbekannt'
                : 'Unbekannt',
          labelOnMobile: true,
        },
      ]}
    >
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
        {account &&
          (account.type === 'brokerage' || account.type === 'crypto' ? (
            <DepotBody account={account} />
          ) : (
            <AccountBody account={account} />
          ))}
      </section>
    </PageFrame>
  );
}

function AccountBody({ account }: { account: AccountRow }) {
  useAmountPrivacy();
  const search = useSearch({ strict: false }) as {
    pruefen?: 'reconcile' | 'value';
    vorschau?: string;
    faellig?: string;
    horizon?: LiquidityHorizon;
    levers?: string;
  };
  const navigate = useNavigate();
  const selection = useLiquiditySelection();
  const horizon = search.horizon ?? selection.horizon;
  const levers =
    search.levers === undefined
      ? selection.levers
      : (search.levers.split(',').filter(Boolean) as LiquidityLeverId[]);
  const canUseLiquidity =
    account.currency === 'EUR' && account.onBudget && account.role === 'budget';
  const liquidity = canUseLiquidity && search.vorschau === 'liquiditaet';
  const today = useRegisterToday();
  const month = monthOf(today);
  const [period, setPeriod] = useState<Period | '6M'>('3M');
  const settings = useQuery(displaySettingsQuery());
  const range = isCalendarRange(period)
    ? calendarRangeWindow(period, today)
    : {
        from:
          period === 'Alles'
            ? account.openingDate
            : `${addMonths(month, period === '3M' ? -3 : period === '1J' ? -12 : -6)}-${today.slice(8)}`,
        to: today,
      };
  // Calendar-month ranges reuse the report picker; presets are rolling and end today.
  if (!isCalendarRange(period) && period !== 'Alles')
    range.from =
      range.from > lastDayOfMonth(range.from.slice(0, 7))
        ? lastDayOfMonth(range.from.slice(0, 7))
        : range.from;
  const previewDays =
    range.to === today ? (settings.data?.futurePreviewDays ?? DEFAULT_FUTURE_PREVIEW_DAYS) : 0;
  const series = useQuery({
    queryKey: [
      'ledger',
      'series',
      account.id,
      range.from,
      range.to,
      previewDays,
      liquidity ? horizon : null,
      liquidity ? levers.join(',') : '',
    ],
    queryFn: () =>
      fetchSeries(
        account.id,
        range.from,
        range.to,
        previewDays,
        liquidity ? { horizon, levers } : undefined,
      ),
  });
  const limit = account.overdraftLimitCents ?? account.creditLimitCents;
  const limitLabel = account.overdraftLimitCents !== null ? 'Dispolimit' : 'Kreditrahmen';
  // The month figure remains independent of the history's loaded pages.
  const movement = useQuery(
    bookingsQuery(
      { accountId: account.id, from: `${month}-01`, to: lastDayOfMonth(month) },
      undefined,
      1,
    ),
  );
  const [panel, setPanel] = useState<BookingPanelState>(null);
  const manual = account.type === 'p2p' || account.type === 'other_asset';
  const value = accountValueEur(account);
  const pending = valuedCurrencyParts(
    account.unclearedCents,
    account.currency,
    account.pendingValuation,
  );

  return (
    <>
      <div className="kacct-head">
        <div>
          <h2>{account.name}</h2>
          <p className="kmeta">
            {ACCOUNT_TYPE_LABEL[account.type]} · {groupOf(account).title}
            {account.closedAt && <span>geschlossen am {longDay(account.closedAt)}</span>}
          </p>
        </div>
        <div className="kacct-actions">
          <AccountReview account={account} />
          {!account.closedAt && (
            <Button onClick={() => setPanel({ mode: 'create', accountId: account.id })}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Buchung erfassen
            </Button>
          )}
        </div>
      </div>
      {manual && !account.hasHoldings && (
        <p className="kmeta">
          Letzter Wert:{' '}
          {nativeCurrency(account.manualValueCents ?? account.balanceCents, account.currency)}
          {' · '}
          {account.lastValuedOn ? longDay(account.lastValuedOn) : 'noch nicht erfasst'}
        </p>
      )}
      <div className="kfigs">
        <div className="fig">
          <small>{account.currency === 'EUR' ? 'Saldo' : `Kontowert · EUR`}</small>
          <strong
            className={cx(value !== null && value < 0 && 'neg')}
            data-testid="account-balance"
          >
            {value === null ? 'Kurs fehlt' : eur(value)}
          </strong>
          {account.currency !== 'EUR' && (
            <p className="kmeta">
              Cash-Saldo:{' '}
              {valuedCurrency(account.balanceCents, account.currency, account.cashValuation)}
            </p>
          )}
          {value === null && <p className="kmeta">{valuationMissingText(account)}</p>}
        </div>
        <div className="fig">
          <small>davon vorgemerkt</small>
          <strong className="muted">{pending.amount}</strong>
          {pending.rate && <p className="kmeta">{pending.rate}</p>}
        </div>
        <div className="fig">
          <small>{monthName(today)}</small>
          <strong className="muted">
            {movement.data
              ? valuedMovement(movement.data.sumCents, account.currency, movement.data.sumEurCents)
              : '–'}
          </strong>
          {account.currency !== 'EUR' && (
            <p className="kmeta">Bewegung · EUR je Buchungstag, Kurse in der Tabelle</p>
          )}
        </div>
        <AccountFreshness
          lastReconciledOn={account.lastReconciledOn}
          bankBalance={account.closedAt ? undefined : account.bankBalance}
        />
      </div>
      <BankBalance account={account} />
      {search.faellig && (
        <p className="kmeta" data-testid="account-payment-context">
          <AppLink className="btn btn-ghost" to="/">
            Heute · Bevorstehende Zahlungen
          </AppLink>{' '}
          · {account.name} · Fälligkeit {longDay(search.faellig)}
        </p>
      )}
      {canUseLiquidity && (
        <Field label="Kontovorschau Zeitraum">
          {({ id }) => (
            <Select
              id={id}
              value={liquidity ? horizon : 'standard'}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== 'standard') selection.setHorizon(next as LiquidityHorizon);
                void navigate({
                  search: ((previous: Record<string, unknown>) => ({
                    ...previous,
                    vorschau: next === 'standard' ? undefined : 'liquiditaet',
                    horizon: next === 'standard' ? undefined : next,
                    levers: levers.join(','),
                  })) as never,
                  replace: true,
                });
              }}
            >
              <option value="standard">Vorschau laut Einstellungen · {previewDays} Tage</option>
              <option value="90d">Liquidität · 90 Tage</option>
              <option value="6m">Liquidität · 6 Monate</option>
              <option value="12m">Liquidität · 12 Monate</option>
            </Select>
          )}
        </Field>
      )}
      {liquidity && (
        <p className="kmeta">
          Gleicher Liquiditätshorizont und gespeicherte Stellschrauben wie in der Haushaltsprognose.
          Nur diesem Konto zugeordnete Beträge; die Haushaltssumme ist kein Nachweis der
          Kontodeckung.
        </p>
      )}
      <div className="kchart-range">
        <Segmented
          label="Saldoverlauf Zeitraum"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '3M', label: '3M' },
            { value: '6M', label: '6M' },
            { value: '1J', label: '12M' },
            { value: 'Alles', label: 'Alles' },
          ]}
        />
        <PeriodQuickSelect
          customOnly
          period={period === '6M' ? `${addMonths(month, -6)}..${month}` : period}
          onChange={setPeriod}
          trend={false}
        />
      </div>
      {series.isPending && <LoadingNote what="Saldoverlauf" />}
      {series.isError && (
        <ErrorNote what="Saldoverlauf" error={series.error} onRetry={() => void series.refetch()} />
      )}
      {series.data && (
        <>
          {series.data.previewCoverage && (
            <>
              <p className="kmeta" data-testid="account-preview-range">
                {account.name} · Vorschau von {longDay(today)} bis{' '}
                {longDay(series.data.previewCoverage.endDay)}
              </p>
              <p className="kmeta" data-testid="account-preview-coverage">
                {series.data.previewCoverage.partial
                  ? 'Teilprognose · fehlende Konto-Zuordnung:'
                  : 'Kontoprognose · nur zugeordnete Beträge:'}{' '}
                Variable Haushaltsausgaben ({eur(series.data.previewCoverage.variableMonthlyCents)}{' '}
                pro Monat), {series.data.previewCoverage.unassignedEventCount}{' '}
                {series.data.previewCoverage.unassignedEventCount === 1
                  ? 'geplantes Ereignis'
                  : 'geplante Ereignisse'}{' '}
                und {series.data.previewCoverage.unassignedPaymentCount} wiederkehrende Zahlungen
                ohne Konto sind ausgeschlossen. Keine Verteilung der Haushaltssumme und keine Zusage
                sicherer Kontodeckung.
              </p>
            </>
          )}
          <BalanceChart
            points={series.data.points}
            windowLabel={period}
            previewPoints={series.data.previewPoints ?? []}
            limitCents={limit}
            limitLabel={limitLabel}
            currency={account.currency}
          />
          {account.currency !== 'EUR' && (
            <details className="kfx-history">
              <summary>EUR-Bewertung · Tageswerte und Kurse</summary>
              <p className="kmeta">
                Cash-Saldo am jeweiligen Tag; Wertpapiere sind hier nicht enthalten.
              </p>
              <table className="ktable">
                <caption className="sr-only">Saldoverlauf mit EUR-Bewertung</caption>
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Saldo · {account.currency} / EUR</th>
                  </tr>
                </thead>
                <tbody>
                  {series.data.points.map((p) => (
                    <tr key={p.date}>
                      <td>{longDay(p.date)}</td>
                      <td>{valuedCurrency(p.balanceCents, account.currency, p.valuation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {(series.data.unavailableCurrencies?.length ?? 0) > 0 && (
            <p role="status">
              Vorschau nicht verfügbar: Wechselkurs fehlt (
              {series.data.unavailableCurrencies?.join(', ')}).
            </p>
          )}
          <div className="legend" aria-hidden="true">
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-actual" d="M0 4h26" />
              </svg>
              Cash-Saldo · {account.currency}
            </span>
            {(series.data.previewPoints?.length ?? 0) > 1 && (
              <span>
                <svg viewBox="0 0 26 8">
                  <path className="l-forecast" d="M0 4h26" />
                </svg>
                {liquidity
                  ? `Liquiditätsvorschau · bis ${longDay(series.data.previewCoverage?.endDay ?? today)}`
                  : `Vorschau · ${previewDays} Tage`}
              </span>
            )}
            {limit !== null && (
              <span>
                <svg viewBox="0 0 26 8">
                  <path className="l-plan" d="M0 4h26" />
                </svg>
                {limitLabel} · {valuedCurrency(-limit, account.currency)}
              </span>
            )}
          </div>
        </>
      )}
      <AccountRegister account={account} />
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </>
  );
}
