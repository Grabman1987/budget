import { Button, CircleNumber, cx, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { KONTEN_META } from '../nav/pages';
import { PageFrame } from '../pages/placeholder-page';
import { AccountFormPanel } from './account-form';
import { useOrderedAccounts, useReorder } from './account-order';
import { BankBalance } from './bank-balance';
import { eur, longDay, nativeCurrency, valuedCurrency } from './format';
import { ACCOUNT_TYPE_LABEL, accountValueEur, valuationMissingText } from './labels';
import { MiniLine } from './mini-line';
import {
  accountCheck,
  accountOverviewPresentation,
  overviewModel,
  seriesChange,
  utilisation,
  type GroupView,
} from './overview-model';
import { accountsQuery, seriesBatchQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import { treePositionsQuery, treeValues, type TreeValue } from './tree-values';
import { ValuationSourceHint, type ValuationSource } from './valuation-hint';
import type { AccountRow, AccountSeriesBatch, AccountSeriesDayQuality, SeriesPoint } from './types';
import './overview.css';

const WINDOW_DAYS = 30;
const CHECK_LABEL: Record<string, string> = {
  checked: 'geprüft',
  due: 'Fällig',
  unreviewed: 'Offen',
  inactive: 'Noch kein Prüfstand',
  unsupported: 'Prüfung nicht unterstützt',
  unavailable: 'Prüfstatus nicht verfügbar',
};

/** Match the existing tree's cash presentation; no money is recalculated here. */
export function overviewValuationSources(
  accounts: ReadonlyArray<
    Pick<AccountRow, 'id' | 'type' | 'closedAt' | 'referenceAccountId' | 'valuationSources'>
  >,
) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const mapped = new Map(
    accounts.map((account) => [account.id, [...(account.valuationSources ?? [])]]),
  );
  for (const depot of accounts) {
    if (!['brokerage', 'crypto'].includes(depot.type) || depot.closedAt) continue;
    const own = depot.valuationSources ?? [];
    mapped.set(
      depot.id,
      own.filter((source) => source.securityId !== null),
    );
    const linked = depot.referenceAccountId ? byId.get(depot.referenceAccountId) : undefined;
    if (linked && !linked.closedAt && !['brokerage', 'crypto'].includes(linked.type))
      mapped.set(linked.id, [
        ...(mapped.get(linked.id) ?? []),
        ...own.filter((source) => source.securityId === null),
      ]);
  }
  return mapped;
}

/** Group sums also contain unlinked depot cash whose amount can be unknown. */
export function overviewGroupValuationSources(
  accounts: ReadonlyArray<Pick<AccountRow, 'id' | 'valuationSources'>>,
  sourcesByRow: ReadonlyMap<string, ValuationSource[]>,
) {
  const mappedCashAccounts = new Set(
    [...sourcesByRow.values()].flatMap((sources) =>
      sources.filter((source) => source.securityId === null).map((source) => source.accountId),
    ),
  );
  return accounts.flatMap((account) => [
    ...(sourcesByRow.get(account.id) ?? []),
    ...(mappedCashAccounts.has(account.id)
      ? []
      : (account.valuationSources?.filter((source) => source.securityId === null) ?? [])),
  ]);
}

/** Operational account figures; valuation/group producers and all write controllers stay shared. */
export function OverviewPage() {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const ordered = useOrderedAccounts(accounts.data?.accounts);
  const positions = useQuery(treePositionsQuery(ordered.accounts));
  const values =
    ordered.accounts && !positions.isError
      ? treeValues(ordered.accounts, positions.data)
      : undefined;
  const model = ordered.accounts ? overviewModel(ordered.accounts, values) : undefined;
  const presentation = model ? accountOverviewPresentation(model) : undefined;
  const sourcesByRow = overviewValuationSources(presentation?.visible ?? []);
  const asOf = accounts.data?.asOf;
  const series = useQuery({
    ...seriesBatchQuery(WINDOW_DAYS, { ...(asOf ? { asOf } : {}), quality: true }),
    enabled: Boolean(asOf && presentation?.visible.length),
  });
  return (
    <PageFrame meta={KONTEN_META}>
      <div className="kview account-overview-577">
        <div className="overview-actions">
          {presentation && presentation.visible.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={ordering}
              onClick={() => setOrdering(!ordering)}
            >
              {ordering ? (
                <Check size={16} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
              )}
              {ordering ? 'Fertig' : 'Reihenfolge ändern'}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Konto anlegen
          </Button>
        </div>
        {accounts.isPending && <LoadingNote what="Konten" />}
        {accounts.isError && (
          <ErrorNote what="Konten" error={accounts.error} onRetry={() => void accounts.refetch()} />
        )}
        {model && presentation && (
          <>
            <OverviewLead presentation={presentation} asOf={asOf} sourcesByRow={sourcesByRow} />
            {presentation.visible.length === 0 ? (
              <EmptyNote>
                Keine offenen Konten. Lege ein Konto an, um hier Saldo und Prüfstand zu sehen.
              </EmptyNote>
            ) : (
              <>
                {series.isError && (
                  <ErrorNote
                    what="Kontoverläufe"
                    error={series.error}
                    onRetry={() => void series.refetch()}
                  />
                )}
                <section className="overview-accounts" aria-labelledby="accts-title">
                  <h2 id="accts-title" className="sr-only">
                    Offene Konten nach Gruppe
                  </h2>
                  <table className={cx('ktable', 'overview-table', ordering && 'is-ordering')}>
                    <caption className="sr-only">
                      Offene Konten mit Prüfstand, Verlauf der letzten 30 Tage und EUR-Wert
                    </caption>
                    <colgroup>
                      <col />
                      <col className="overview-col-check" />
                      <col className="overview-col-line" />
                      <col className="overview-col-value" />
                      <col className="overview-col-details" />
                      {ordering && <col className="overview-col-order" />}
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col">Konto</th>
                        <th scope="col">Prüfstand</th>
                        <th scope="col">30 Tage</th>
                        <th scope="col" className="overview-row-value">
                          Wert in EUR
                        </th>
                        <th scope="col">
                          <span className="sr-only">Details</span>
                        </th>
                        {ordering && (
                          <th scope="col">
                            <span className="sr-only">Reihenfolge</span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    {model.groups.map((group, index) => (
                      <tbody key={group.group.id}>
                        <OverviewGroup
                          group={group}
                          index={index + 1}
                          values={values}
                          loading={positions.isFetching && !positions.data}
                          series={series.data}
                          seriesLoading={series.isPending}
                          ordering={ordering}
                          related={presentation.related}
                          sourcesByRow={sourcesByRow}
                          onReorder={(ids) => ordered.save(group.group.id, ids)}
                        />
                      </tbody>
                    ))}
                  </table>
                </section>
              </>
            )}
          </>
        )}
      </div>
      <AccountFormPanel open={creating} onClose={() => setCreating(false)} />
    </PageFrame>
  );
}

/** The shared hint is reused with presentation-only masking of every editable source label. */
function OverviewValueSource({
  sources,
  label,
}: {
  sources: ReadonlyArray<ValuationSource> | undefined;
  label: string;
}) {
  useAmountPrivacy();
  return (
    <ValuationSourceHint
      label={maskMoneyText(label)}
      sources={sources?.map((source) => ({
        ...source,
        name: source.name === null ? null : maskMoneyText(source.name),
        source: source.source === null ? null : maskMoneyText(source.source),
        fx: {
          ...source.fx,
          source: source.fx.source === null ? null : maskMoneyText(source.fx.source),
        },
      }))}
    />
  );
}

function OverviewLead({
  presentation,
  asOf,
  sourcesByRow,
}: {
  presentation: ReturnType<typeof accountOverviewPresentation>;
  asOf: string | undefined;
  sourcesByRow: ReadonlyMap<string, ValuationSource[]>;
}) {
  const budget = presentation.budget;
  const value = budget ? budget.sumCents : 0;
  return (
    <section className="overview-lead" aria-labelledby="overview-lead-title">
      <h2 id="overview-lead-title">Saldo Budget-Konten</h2>
      <div className="overview-lead-value" data-testid="budget-accounts-balance">
        {value === null ? 'Nicht verfügbar' : `${budget?.sumApprox ? '≈ ' : ''}${eur(value)}`}
        <OverviewValueSource
          sources={budget ? overviewGroupValuationSources(budget.accounts, sourcesByRow) : []}
          label="Saldo Budget-Konten"
        />
      </div>
      <div className="overview-lead-links">
        <Link to="/konten/pruefen">
          {presentation.checked} von {presentation.visible.length} Konten geprüft
        </Link>
        <Link to="/vermoegen/nettovermoegen">Vermögen ansehen</Link>
        {asOf && <span>Stand {longDay(asOf)}</span>}
      </div>
      {presentation.reviewUnavailable > 0 && (
        <p role="status">
          Prüfstatus für {presentation.reviewUnavailable}{' '}
          {presentation.reviewUnavailable === 1 ? 'Konto' : 'Konten'} nicht verfügbar.
        </p>
      )}
      {value === null && budget && (
        <p role="status">
          {valuationMissingText({
            missingFxCurrencies: [
              ...new Set(budget.accounts.flatMap((a) => a.missingFxCurrencies)),
            ],
            missingPriceSecurityIds: [
              ...new Set(budget.accounts.flatMap((a) => a.missingPriceSecurityIds)),
            ],
          })}
        </p>
      )}
    </section>
  );
}

function OverviewGroup({
  group,
  index,
  values,
  loading,
  series,
  seriesLoading,
  related,
  sourcesByRow,
  ordering,
  onReorder,
}: {
  group: GroupView;
  index: number;
  values: ReadonlyMap<string, TreeValue> | undefined;
  loading: boolean;
  series: AccountSeriesBatch | undefined;
  seriesLoading: boolean;
  related: ReadonlyMap<string, AccountRow[]>;
  sourcesByRow: ReadonlyMap<string, ValuationSource[]>;
  ordering: boolean;
  onReorder: (ids: string[]) => void;
}) {
  const names = new Map(group.accounts.map((a) => [a.id, maskMoneyText(a.name)]));
  const reorder = useReorder(
    group.accounts.map((a) => a.id),
    onReorder,
    (id) => names.get(id) ?? '',
  );
  return (
    <>
      <tr className="kgroup overview-group" id={`kg-${group.group.id}`}>
        <th scope="rowgroup" colSpan={3}>
          <CircleNumber n={index} size="sm" />
          <span className="grp-title">{group.group.title}</span>
          {ordering && reorder.status}
        </th>
        <td className="kc-num overview-row-value">
          <span className="overview-group-amount" data-testid="account-group-value">
            {group.sumCents === null ? '–' : `${group.sumApprox ? '≈ ' : ''}${eur(group.sumCents)}`}
          </span>
          <OverviewValueSource
            sources={overviewGroupValuationSources(group.accounts, sourcesByRow)}
            label={group.group.title}
          />
        </td>
        <td />
        {ordering && <td />}
      </tr>
      {group.accounts.map((a, rowIndex) => (
        <OverviewAccount
          key={a.id}
          account={a}
          {...(!ordering && group.accounts.length > 5 ? { position: `${index + 1}.${rowIndex + 1}` } : {})}
          value={values?.get(a.id)}
          useTreeValues={values !== undefined}
          loading={loading}
          sources={sourcesByRow.get(a.id)}
          related={related.get(a.id) ?? []}
          points={series?.series[a.id]?.points ?? []}
          quality={series?.quality?.[a.id]}
          seriesLoading={seriesLoading}
          ordering={ordering}
          rowProps={reorder.rowProps(a.id)}
          controls={reorder.controls(a.id)}
        />
      ))}
    </>
  );
}

function OverviewAccount({
  account: a,
  position,
  value: shown,
  useTreeValues,
  loading,
  sources,
  related,
  points,
  quality,
  seriesLoading,
  ordering,
  rowProps,
  controls,
}: {
  account: AccountRow;
  position?: string;
  value: TreeValue | undefined;
  useTreeValues: boolean;
  loading: boolean;
  sources: ValuationSource[] | undefined;
  related: AccountRow[];
  points: ReadonlyArray<SeriesPoint>;
  quality: Readonly<Record<string, AccountSeriesDayQuality>> | undefined;
  seriesLoading: boolean;
  ordering: boolean;
  rowProps: ReturnType<ReturnType<typeof useReorder>['rowProps']>;
  controls: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const checkId = useId();
  const name = maskMoneyText(a.name);
  const value = useTreeValues ? (shown?.cents ?? null) : accountValueEur(a);
  const check = accountCheck(a);
  const delta =
    points.length > 1 && points.every((p) => quality?.[p.date]?.known === true)
      ? seriesChange(points)
      : null;
  const util = utilisation(a);
  return (
    <>
      <tr
        {...rowProps}
        className={cx(rowProps.className, 'krow', 'overview-account-row')}
        data-account-id={a.id}
      >
        <th scope="row" colSpan={2} className="overview-row-name">
          <Link
            className="overview-account-link"
            to="/konten/$id"
            params={{ id: a.id }}
            aria-label={name}
            aria-describedby={checkId}
          >
            <span>
              <span className="kname">{position && <span className="overview-position" aria-hidden="true">{position} </span>}{name}</span>
              {related.length > 0 && (
                <span
                  className="overview-platform-mark"
                  title="Depot und Verrechnungskonto sind verknüpft"
                >
                  Plattform
                </span>
              )}
            </span>
            <span
              id={checkId}
              data-review-state={check.state}
              className={cx('kcheck', 'overview-check', check.stale && 'is-due is-stale')}
            >
              {check.stale && <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />}
              {CHECK_LABEL[check.state] ?? CHECK_LABEL['unavailable']}
            </span>
          </Link>
        </th>
        <td className="overview-row-line">
          {seriesLoading ? (
            <span className="overview-line-empty">Verlauf lädt …</span>
          ) : (
            <MiniLine
              points={points}
              currency={a.currency}
              days={WINDOW_DAYS}
              requireQuality
              quality={quality}
              label={name}
            />
          )}
        </td>
        <td className={cx('kc-num', 'overview-row-value', value !== null && value < 0 && 'is-neg')}>
          <span data-testid="account-value">
            {value === null
              ? loading
                ? '–'
                : 'Nicht verfügbar'
              : `${shown?.approx ? '≈ ' : ''}${eur(value)}`}
          </span>
        </td>
        <td className="overview-row-details">
          <Button
            size="sm"
            variant="ghost"
            aria-controls={detailId}
            aria-expanded={expanded}
            aria-label={`Details zu ${name}`}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
          </Button>
        </td>
        {ordering && <td className="overview-row-order">{controls}</td>}
      </tr>
      {expanded && (
        <tr className="overview-detail">
          <td colSpan={ordering ? 6 : 5} id={detailId}>
            <dl className="overview-detail-facts">
              <div>
                <dt>Kontotyp</dt>
                <dd>
                  {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}
                </dd>
              </div>
              <div>
                <dt>Prüfstand</dt>
                <dd className={check.stale ? 'is-stale' : undefined}>{check.text}</dd>
              </div>
              {a.reviewStatus?.dueOn && (
                <div>
                  <dt>Nächste Prüffrist bei Aktivität</dt>
                  <dd>{longDay(a.reviewStatus.dueOn)}</dd>
                </div>
              )}
              <div>
                <dt>Buchungssaldo</dt>
                <dd>
                  {maskMoneyText(valuedCurrency(a.balanceCents, a.currency, a.cashValuation))}
                </dd>
              </div>
              <div>
                <dt>Vorgemerkt</dt>
                <dd>
                  {a.pendingCount} Buchungen ·{' '}
                  {maskMoneyText(valuedCurrency(a.unclearedCents, a.currency, a.pendingValuation))}
                </dd>
              </div>
              <div>
                <dt>Veränderung im Verlauf</dt>
                <dd>
                  {delta === null ? 'Nicht verfügbar' : nativeCurrency(delta, a.currency, true)}
                </dd>
              </div>
              {shown?.cashCents != null && (
                <div>
                  <dt>Zusätzliches Cash im Depot (in Gruppensumme)</dt>
                  <dd>{eur(shown.cashCents)}</dd>
                </div>
              )}
              {shown?.includedCashCents != null && (
                <div>
                  <dt>Davon zugeordnetes Depot-Cash</dt>
                  <dd>{eur(shown.includedCashCents)}</dd>
                </div>
              )}
              {value === null && (
                <div>
                  <dt>Bewertung</dt>
                  <dd>{valuationMissingText(a)}</dd>
                </div>
              )}
              {util !== null && a.creditLimitCents !== null && (
                <div>
                  <dt>Kreditrahmen</dt>
                  <dd>
                    {Math.round(util * 100)} % von {nativeCurrency(a.creditLimitCents, a.currency)}
                  </dd>
                </div>
              )}
            </dl>
            <OverviewValueSource sources={sources} label={name} />
            {related.length > 0 && (
              <p className="overview-platform-links">
                Plattformzuordnung:{' '}
                {related.map((other) => (
                  <Link key={other.id} to="/konten/$id" params={{ id: other.id }}>
                    {maskMoneyText(other.name)}
                  </Link>
                ))}
                <span>Jedes Konto bleibt einmal in seiner Gruppe enthalten.</span>
              </p>
            )}
            <BankBalance account={{ ...a, name }} />
            <MiniLine
              points={points}
              currency={a.currency}
              days={WINDOW_DAYS}
              requireQuality
              quality={quality}
              label={name}
              table
            />
          </td>
        </tr>
      )}
    </>
  );
}
