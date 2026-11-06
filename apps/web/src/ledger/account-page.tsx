import { ClosedAccountNotice } from './closed-account-disclosure';
import { AccountFreshness } from './account-freshness';
import { AccountStatementIntake } from '../statement-intake/statement-review-726';
import { InboxWorkflow } from '../inbox/inbox-page';
import { BankBalance } from './bank-balance';
import { useAmountPrivacy, Button, Segmented, Select, Field, cx } from '@budget/ui';
import {
  addMonths,
  addDays,
  DEFAULT_FUTURE_PREVIEW_DAYS,
  lastDayOfMonth,
  monthOf,
  type LiquidityHorizon,
  type LiquidityLeverId,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch, useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  MoreHorizontal,
  Settings2,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ACCOUNT_PAGE } from '../nav/pages';
import { KontenFrame } from './konten-frame';
import { BalanceChart } from './balance-chart';
import { BookingPanel, type BookingPanelState } from './booking-panel';
import { AccountRegister } from './account-register';
import { useRegisterToday } from './upcoming-register';
import {
  eur,
  longDay,
  monthName,
  nativeCurrency,
  shortDay,
  valuedCurrency,
  valuedCurrencyParts,
  valuedMovement,
} from './format';
import { ACCOUNT_TYPE_LABEL, accountValueEur, groupOf, valuationMissingText } from './labels';
import { fetchSeries } from './api';
import { displaySettingsQuery } from '../pages/future-preview-setting';
import { accountsQuery, bookingsQuery } from './queries';
import { AccountReview } from './account-review';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow } from './types';
import { useLiquiditySelection } from '../reports/liquidity-selection';
import { AppLink } from '../shell/app-link';
import { DepotBody } from './depot-page';
import { useStoredFlag } from '../shell/use-stored-flag';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './account-redesign.css';
import { AccountCheckMark } from './account-check-mark';
import { KontenMenu } from './konten-menu';

/** localStorage key of the account-history disclosure (absent = collapsed). */
export const CHART_OPEN_KEY = 'budget.account.chart-open';

type ChartPeriod = '1M' | '3M' | '1J' | 'Alles';

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
  const bankReview =
    account && !accounts.isError ? (
      <InboxWorkflow key={account.id} bankAccountId={account.id} />
    ) : undefined;
  return (
    <KontenFrame
      meta={ACCOUNT_PAGE}
      view="account"
      phoneTitle={account?.name}
      sourceDay={accounts.data?.asOf}
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
      <section
        className={cx('kacct', REDESIGN_ENABLED && 'account-detail-redesign')}
        data-redesign={REDESIGN_ENABLED ? 'account-detail' : undefined}
      >
        <Link className="kback" to="/konten">
          <ChevronLeft className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
          {REDESIGN_ENABLED ? <span className="sr-only">Übersicht</span> : 'Übersicht'}
        </Link>
        {account && <ClosedAccountNotice account={account} />}
        {account && !REDESIGN_ENABLED && (
          <AccountStatementIntake key={account.id} accountId={account.id} />
        )}
        {accounts.isPending && <LoadingNote what="Konto" />}
        {accounts.isError && (
          <ErrorNote what="Konto" error={accounts.error} onRetry={() => void accounts.refetch()} />
        )}
        {accounts.data && !account && <EmptyNote>Dieses Konto gibt es nicht (mehr).</EmptyNote>}
        {account &&
          (account.type === 'brokerage' || account.type === 'crypto' ? (
            <DepotBody account={account} bankReview={bankReview} />
          ) : (
            <AccountBody account={account} bankReview={bankReview} />
          ))}
        {account && REDESIGN_ENABLED && (
          <details className="account-documents-redesign">
            <summary>Dokumente und Kontoauszüge</summary>
            <section aria-label="Dokumente und Kontoauszüge">
              <AccountStatementIntake key={account.id} accountId={account.id} />
            </section>
          </details>
        )}
      </section>
    </KontenFrame>
  );
}

function AccountBody({ account, bankReview }: { account: AccountRow; bankReview?: ReactNode }) {
  useAmountPrivacy();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [account.id]);
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
  const [period, setPeriod] = useState<ChartPeriod>(REDESIGN_ENABLED ? '1M' : '3M');
  const [legacyChartOpen, setLegacyChartOpen] = useStoredFlag(CHART_OPEN_KEY);
  const [redesignChartOpen, setRedesignChartOpen] = useState(() => {
    try {
      return localStorage.getItem('budget.redesign.account.chart-open') !== '0';
    } catch {
      return true;
    }
  });
  const chartOpen = REDESIGN_ENABLED ? redesignChartOpen : legacyChartOpen;
  const setChartOpen = (open: boolean) => {
    if (!REDESIGN_ENABLED) return setLegacyChartOpen(open);
    setRedesignChartOpen(open);
    try {
      localStorage.setItem('budget.redesign.account.chart-open', open ? '1' : '0');
    } catch {
      /* Private mode retains the current in-memory disclosure. */
    }
  };
  const [fxView, setFxView] = useState<'native' | 'eur'>('native');
  const settings = useQuery(displaySettingsQuery());
  // Presets are rolling and end today.
  const rollingFrom = `${addMonths(month, period === '3M' ? -3 : -12)}-${today.slice(8)}`;
  const range = {
    from:
      period === '1M'
        ? addDays(today, -30)
        : period === 'Alles'
          ? account.openingDate
          : rollingFrom > lastDayOfMonth(rollingFrom.slice(0, 7))
            ? lastDayOfMonth(rollingFrom.slice(0, 7))
            : rollingFrom,
    to: today,
  };
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

  const monthFigure = (
    <div className="fig kacct-month">
      <small>{monthName(today)}</small>
      <strong className="muted">
        {movement.data?.nativeTotalsPending
          ? 'Bewegung wird aktualisiert …'
          : movement.data
            ? valuedMovement(movement.data.sumCents, account.currency, movement.data.sumEurCents)
            : '–'}
      </strong>
      {account.currency !== 'EUR' && (
        <p className="kmeta">Bewegung · EUR je Buchungstag, Kurse in der Tabelle</p>
      )}
    </div>
  );
  const previewControls = (
    <>
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
              <option value="35d">Liquidität · 35 Tage</option>
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
    </>
  );
  const chartControls = (
    <>
      {chartOpen && account.currency !== 'EUR' && (
        <Segmented
          label="Saldoverlauf Währung"
          value={fxView}
          onChange={setFxView}
          options={[
            { value: 'native', label: `Kontowährung · ${account.currency}` },
            { value: 'eur', label: 'EUR' },
          ]}
        />
      )}
      {chartOpen && (
        <Segmented
          label="Saldoverlauf Zeitraum"
          value={period}
          onChange={setPeriod}
          options={[
            ...(REDESIGN_ENABLED ? [{ value: '1M' as const, label: '30T' }] : []),
            { value: '3M', label: '3M' },
            { value: '1J', label: '12M' },
            { value: 'Alles', label: 'Alles' },
          ]}
        />
      )}
    </>
  );
  const coverageNote = (
    <>
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
        </>
      )}
    </>
  );
  return (
    <div className="kacct-register">
      <div className="kacct-head">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {account.name}
          </h2>
          {REDESIGN_ENABLED && <AccountCheckMark account={account} />}
          <p className="kmeta">
            {ACCOUNT_TYPE_LABEL[account.type]} · {groupOf(account).title}
            {account.closedAt && <span>geschlossen am {longDay(account.closedAt)}</span>}
          </p>
        </div>
        <div className="kacct-actions">
          {REDESIGN_ENABLED && (
            <>
              <KontenMenu
                label="Kontoaktionen"
                icon={<MoreHorizontal size={16} aria-hidden="true" />}
                iconOnly
                className="account-actions-menu"
              >
                <a className="btn btn-ghost" href={`#account-register-${account.id}`}>
                  Buchungen ansehen
                </a>
                <AppLink className="btn btn-ghost" to="/einstellungen/konten">
                  Kontoeinstellungen
                </AppLink>
              </KontenMenu>
              <AccountReview account={account} badgeOnPhone />
            </>
          )}
          {!account.closedAt && (
            <Button onClick={() => setPanel({ mode: 'create', accountId: account.id })}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              {REDESIGN_ENABLED ? (
                <span className="sr-only">Buchung erfassen</span>
              ) : (
                'Buchung erfassen'
              )}
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
      <div className="kfigs kacct-kpis">
        <div className="fig kacct-saldo">
          <small className={REDESIGN_ENABLED && account.currency === 'EUR' ? 'sr-only' : undefined}>
            {account.currency === 'EUR' ? 'Saldo' : `Kontowert · EUR`}
          </small>
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
          {REDESIGN_ENABLED && !manual && (
            <p className="kmeta">
              Bestätigt {nativeCurrency(account.clearedCents, account.currency)} · Vorgemerkt{' '}
              {pending.amount}
              {pending.rate && <> · {pending.rate}</>}
            </p>
          )}
        </div>
        {!REDESIGN_ENABLED && (
          <div className="fig kacct-pending">
            <small>davon vorgemerkt</small>
            <strong className="muted">{pending.amount}</strong>
            {pending.rate && <p className="kmeta">{pending.rate}</p>}
          </div>
        )}
        {!REDESIGN_ENABLED && monthFigure}
        {!REDESIGN_ENABLED && <AccountReview account={account} compact />}
        {account.closedAt && (
          <span className="pill">
            {account.lastReconciledOn
              ? `Geprüft ${shortDay(account.lastReconciledOn)}`
              : 'Nie geprüft'}
          </span>
        )}
        {!REDESIGN_ENABLED && (
          <details className="kacct-source">
            <summary>
              Datenstand
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </summary>
            <AccountFreshness
              lastReconciledOn={account.lastReconciledOn}
              bankBalance={account.closedAt ? undefined : account.bankBalance}
            />
          </details>
        )}
      </div>
      {!REDESIGN_ENABLED && <BankBalance account={account} />}
      {!REDESIGN_ENABLED && bankReview}
      {search.faellig && (
        <p className="kmeta" data-testid="account-payment-context">
          <AppLink className="btn btn-ghost" to="/">
            Heute · Bevorstehende Zahlungen
          </AppLink>{' '}
          · {account.name} · Fälligkeit {longDay(search.faellig)}
        </p>
      )}
      {!REDESIGN_ENABLED && previewControls}
      <section className="kchart" aria-label="Saldoverlauf">
        <div className="kchart-head">
          <button
            type="button"
            className="kchart-toggle"
            aria-expanded={chartOpen}
            aria-controls="account-chart-body"
            data-testid="account-chart-toggle"
            onClick={() => setChartOpen(!chartOpen)}
          >
            {chartOpen ? (
              <ChevronDown
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="icon icon-sm"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            {REDESIGN_ENABLED ? `Kontoverlauf · ${previewDays} Tage` : 'Saldoverlauf'}
          </button>
          {previewDays > 0 &&
            (series.data?.previewPoints?.length ?? 0) > 0 &&
            (!REDESIGN_ENABLED || liquidity) && (
              <span className="pill" data-testid="account-chart-chip">
                {liquidity ? 'Liquiditätsprognose' : `Prognose ${previewDays} Tage`}
              </span>
            )}
          {!REDESIGN_ENABLED && chartControls}
          {REDESIGN_ENABLED && series.data?.previewCoverage?.partial && (
            <span
              className="pill"
              title="Nicht zugeordnete Beträge sind in den Einstellungen aufgeführt."
            >
              Teilprognose
            </span>
          )}
          {REDESIGN_ENABLED && (
            <KontenMenu
              className="account-chart-options"
              label="Kontoverlauf einstellen"
              icon={<Settings2 size={16} aria-hidden="true" />}
              iconOnly
            >
              {previewControls}
              {chartControls}
              {coverageNote}
              {series.data && (
                <details className="account-chart-table">
                  <summary>Werte als Tabelle</summary>
                  <table>
                    <caption>Saldoverlauf · Tageswerte</caption>
                    <thead>
                      <tr>
                        <th scope="col">Datum</th>
                        <th scope="col">Art</th>
                        <th scope="col">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...series.data.points.map((point) => ({ point, kind: 'Verlauf' })),
                        ...(series.data.previewPoints ?? []).map((point) => ({
                          point,
                          kind: 'Vorschau',
                        })),
                      ].map(({ point, kind }) => (
                        <tr key={`${kind}-${point.date}`}>
                          <td>{longDay(point.date)}</td>
                          <td>{kind}</td>
                          <td>
                            {valuedCurrency(point.balanceCents, account.currency, point.valuation)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </KontenMenu>
          )}
        </div>
        {chartOpen && series.isPending && <LoadingNote what="Saldoverlauf" />}
        {series.isError && (
          <ErrorNote
            what="Saldoverlauf"
            error={series.error}
            onRetry={() => void series.refetch()}
          />
        )}
        {!REDESIGN_ENABLED && coverageNote}
        <div id="account-chart-body" data-testid="account-chart-body" hidden={!chartOpen}>
          {chartOpen && series.data && (
            <>
              <BalanceChart
                points={series.data.points}
                windowLabel={period}
                previewPoints={series.data.previewPoints ?? []}
                limitCents={limit}
                limitLabel={limitLabel}
                currency={account.currency}
                view={fxView}
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
                  Cash-Saldo · {fxView === 'eur' ? 'EUR' : account.currency}
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
        </div>
      </section>
      <AccountRegister account={account} />
      {REDESIGN_ENABLED && (
        <details className="account-value-details">
          <summary>Datenstand und Monatsbewegung</summary>
          {monthFigure}
          <AccountFreshness
            lastReconciledOn={account.lastReconciledOn}
            bankBalance={account.closedAt ? undefined : account.bankBalance}
          />
        </details>
      )}
      {REDESIGN_ENABLED && (
        <details className="account-bank-queue">
          <summary>Bankumsätze und Bankstand prüfen</summary>
          <BankBalance account={account} />
          {bankReview}
        </details>
      )}
      <BookingPanel state={panel} onClose={() => setPanel(null)} />
    </div>
  );
}
