import { BankBalance } from './bank-balance';
import {
  useAmountPrivacy,
  ChartValue,
  privateAmount,
  Button,
  CircleNumber,
  DimensionChain,
  type DimensionChainTerm,
  cx,
} from '@budget/ui';
import { addDays, cents, todayInVienna } from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, Check, Pencil, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { PageFrame } from '../pages/placeholder-page';
import { KONTEN_META } from '../nav/pages';
import { AccountFormPanel } from './account-form';
import { useOrderedAccounts, useReorder } from './account-order';
import { fetchAccounts } from './api';
import { eur, eurParts, eurWhole, nativeCurrencyWhole, nativeCurrency } from './format';
import {
  ACCOUNT_TYPE_LABEL,
  accountValueEur,
  valuationMissingText,
  type AccountGroupId,
} from './labels';
import { MiniLine } from './mini-line';
import {
  netWorthChange,
  accountCheck,
  overviewModel,
  seriesChange,
  utilisation,
  type GroupView,
} from './overview-model';
import { accountsQuery, LEDGER_KEY, seriesBatchQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import { treePositionsQuery, treeValues, type TreeValue } from './tree-values';
import { ValuationSourceHint, type ValuationSource } from './valuation-hint';
import type { AccountRow, SeriesPoint } from './types';

const META = KONTEN_META;
/** Window of the sparklines and of the net-worth change figure. */
const WINDOW_DAYS = 90;

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

/** Konten › Übersicht: net worth with its chain by group, then the parts list of the accounts. */
export function OverviewPage() {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const ordered = useOrderedAccounts(accounts.data?.accounts);
  const positions = useQuery(treePositionsQuery(ordered.accounts));
  // Depots show their Depotwert, their cash sits on the Verrechnungskonto (same figures as the
  // sidebar tree); depots are unknown ("–") while the positions load. Only when they cannot be read
  // the shared EUR value per account is shown.
  const values =
    ordered.accounts && !positions.isError
      ? treeValues(ordered.accounts, positions.data)
      : undefined;
  const model = ordered.accounts ? overviewModel(ordered.accounts, values) : undefined;

  return (
    <PageFrame meta={META}>
      <div className="kview">
        <div className="kbar">
          {model && model.groups.length > 0 && (
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
        {model && model.groups.length === 0 && model.closed.length === 0 && (
          <EmptyNote
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                Erstes Konto anlegen
              </Button>
            }
          >
            Noch keine Konten. Lege ein Konto mit Startsaldo an, dann kannst du Buchungen erfassen.
          </EmptyNote>
        )}
        {model && (model.groups.length > 0 || model.closed.length > 0) && (
          <>
            <NetWorth
              model={model}
              accounts={accounts.data?.accounts ?? []}
              asOf={accounts.data?.asOf ?? todayInVienna()}
            />
            <AccountsTable
              model={model}
              values={values}
              loading={positions.isFetching && !positions.data}
              ordering={ordering}
              onReorder={ordered.save}
            />
          </>
        )}
      </div>
      <AccountFormPanel open={creating} onClose={() => setCreating(false)} />
    </PageFrame>
  );
}

function NetWorth({
  model,
  accounts,
  asOf,
}: {
  model: ReturnType<typeof overviewModel>;
  accounts: AccountRow[];
  asOf: string;
}) {
  useAmountPrivacy();
  const before = addDays(asOf, -WINDOW_DAYS);
  const prior = useQuery({
    queryKey: [...LEDGER_KEY, 'accounts', before],
    queryFn: () => fetchAccounts(before),
  });
  const change = prior.data ? netWorthChange(accounts, prior.data.accounts, before) : null;

  const jump = (target: string) => () => {
    const row = document.getElementById(target === 'closed' ? 'kaccts-closed' : `kg-${target}`);
    if (!row) return;
    if (row instanceof HTMLDetailsElement) row.open = true;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('is-flash');
    window.setTimeout(() => row.classList.remove('is-flash'), 900);
  };
  const terms: DimensionChainTerm[] = [];
  if (
    model.netWorthCents !== null &&
    model.closedValueCents !== null &&
    model.groups.every((g) => g.sumCents !== null)
  ) {
    // Chain in the order of the groups: the first term stands as it is, the following ones add or
    // subtract by sign (Kreditkarten and Kredite are negative and so get a minus).
    for (const { group, sumCents } of model.groups) {
      if (sumCents === null) continue;
      const first = terms.length === 0;
      terms.push({
        label: group.title,
        value: cents(first ? sumCents : Math.abs(sumCents)),
        ...(first ? {} : { op: sumCents < 0 ? ('-' as const) : ('+' as const) }),
        onSelect: jump(group.id),
      });
    }
    if (model.closedValueCents !== 0) {
      const closedIsNegative = model.closedValueCents < 0;
      terms.push({
        label: 'Geschlossene Konten',
        value: cents(Math.abs(model.closedValueCents)),
        op: closedIsNegative ? '-' : '+',
        onSelect: jump('closed'),
      });
    }
    terms.push({ label: 'Nettovermögen', value: cents(model.netWorthCents), op: '=' });
  }

  const parts = model.netWorthCents === null ? null : eurParts(model.netWorthCents);

  return (
    <section className="knw" aria-labelledby="nw-title">
      <div className="tbd-head">
        <h2 id="nw-title">Nettovermögen</h2>
        {change !== null && (
          <span className="tbd-state">
            <span className={change < 0 ? 'ink' : 'ok'}>
              {change < 0 ? (
                <TrendingDown
                  className="icon icon-sm"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              ) : (
                <TrendingUp
                  className="icon icon-sm"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              )}
              {eurWhole(change, true)} in {WINDOW_DAYS} Tagen
            </span>
          </span>
        )}
      </div>
      <div className="tbd-fig">
        <span data-testid="net-worth">
          {parts ? (
            <>
              {parts.whole}
              <span className="cents">,{parts.fraction} €</span>
            </>
          ) : (
            <span>Nicht verfügbar</span>
          )}
        </span>
        <ValuationSourceHint
          sources={accounts.flatMap((a) => a.valuationSources ?? [])}
          label="Nettovermögen"
        />
      </div>
      {model.netWorthCents === null ? (
        <p role="status" className="ksum">
          EUR-Wert nicht verfügbar · {valuationMissingText(model)}
        </p>
      ) : (
        <DimensionChain terms={terms} label="Maßkette Nettovermögen nach Kontogruppen" />
      )}
    </section>
  );
}

function AccountsTable({
  model,
  values,
  loading,
  ordering,
  onReorder,
}: {
  model: ReturnType<typeof overviewModel>;
  values: ReadonlyMap<string, TreeValue> | undefined;
  /** The positions are still loading: unknown figures show a dash. */
  loading: boolean;
  ordering: boolean;
  onReorder: (groupId: AccountGroupId, ids: string[]) => void;
}) {
  useAmountPrivacy();
  const sourcesByRow = overviewValuationSources([
    ...model.groups.flatMap((g) => g.accounts),
    ...model.closed,
  ]);
  const open = model.groups.flatMap((g) => g.accounts);
  // One request for all accounts instead of one per account.
  const series = useQuery(seriesBatchQuery(WINDOW_DAYS));
  const byId = new Map<string, SeriesPoint[]>();
  for (const a of open) {
    const points = series.data?.series[a.id]?.points;
    if (points) byId.set(a.id, points);
  }

  return (
    <section className="kaccts" aria-labelledby="accts-title">
      <h2 className="sr-only" id="accts-title">
        Konten nach Gruppe
      </h2>
      <table className={cx('ktable', ordering && 'is-ordering')}>
        <caption className="sr-only">
          Konten mit Saldo und Verlauf der letzten {WINDOW_DAYS} Tage
        </caption>
        <thead>
          <tr>
            <th className="tech kc-pos" scope="col">
              Pos.
            </th>
            <th className="tech" scope="col">
              Konto
            </th>
            <th className="tech kc-line" scope="col">
              {WINDOW_DAYS} Tage
            </th>
            <th className="tech kc-num" scope="col">
              Wert in EUR
            </th>
            {ordering && (
              <th className="tech kc-order" scope="col">
                <span className="sr-only">Reihenfolge</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {model.groups.map((g, gi) => (
            <GroupRows
              key={g.group.id}
              view={g}
              values={values}
              loading={loading}
              sourcesByRow={sourcesByRow}
              index={gi + 1}
              series={byId}
              ordering={ordering}
              onReorder={(ids) => onReorder(g.group.id, ids)}
            />
          ))}
        </tbody>
      </table>
      {model.closed.length > 0 && (
        <details className="kclosed" id="kaccts-closed">
          <summary>
            Geschlossen <span className="kclosed-n">({model.closed.length})</span>
          </summary>
          <ul>
            {model.closed.map((a) => (
              <li key={a.id}>
                <Link className="kname prow-link" to="/konten/$id" params={{ id: a.id }}>
                  {a.name}
                </Link>
                <span className="kmeta">{ACCOUNT_TYPE_LABEL[a.type]}</span>
                <span className={cx('kclosed-val', (accountValueEur(a) ?? 0) < 0 && 'is-neg')}>
                  {accountValueEur(a) === null ? valuationMissingText(a) : eur(accountValueEur(a)!)}
                  <ValuationSourceHint sources={a.valuationSources} label={a.name} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function GroupRows({
  view,
  values,
  sourcesByRow,
  loading,
  index,
  series,
  ordering,
  onReorder,
}: {
  view: GroupView;
  values: ReadonlyMap<string, TreeValue> | undefined;
  loading: boolean;
  sourcesByRow: ReadonlyMap<string, ValuationSource[]>;
  index: number;
  series: Map<string, SeriesPoint[]>;
  ordering: boolean;
  onReorder: (ids: string[]) => void;
}) {
  useAmountPrivacy();
  const names = new Map(view.accounts.map((a) => [a.id, a.name]));
  const reorder = useReorder(
    view.accounts.map((a) => a.id),
    onReorder,
    (id) => names.get(id) ?? '',
  );
  return (
    <>
      <tr className="kgroup" id={`kg-${view.group.id}`}>
        <td className="kc-pos">
          <CircleNumber n={index} size="sm" />
        </td>
        <td>
          <span className="grp-title">{view.group.title}</span>
          <span className="grp-sub">{view.group.sub}</span>
          {ordering && reorder.status}
        </td>
        <td className="kc-line" />
        <td className="kc-num">
          <span
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <span
              data-testid="account-group-value"
              style={
                view.sumCents === null
                  ? { minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }
                  : { whiteSpace: 'nowrap' }
              }
            >
              {view.sumCents === null
                ? loading
                  ? '–'
                  : 'Kurs fehlt'
                : `${view.sumApprox && !view.accounts.some((a) => a.valuationSources) ? '≈ ' : ''}${eur(view.sumCents)}`}
            </span>
            <ValuationSourceHint
              sources={overviewGroupValuationSources(view.accounts, sourcesByRow)}
              label={view.group.title}
            />
          </span>
        </td>
        {ordering && <td className="kc-order" />}
      </tr>
      {view.accounts.map((a, i) => {
        const points = series.get(a.id);
        const delta = points ? seriesChange(points) : null;
        const util = utilisation(a);
        const shown = values?.get(a.id);
        const value = shown ? shown.cents : accountValueEur(a);
        const check = accountCheck(a);
        const row = reorder.rowProps(a.id);
        return (
          <tr {...row} className={cx(row.className, 'krow')} key={a.id}>
            <td className="kc-pos">
              <span className="pos">{`${index}.${i + 1}`}</span>
            </td>
            <td>
              <Link className="kname prow-link" to="/konten/$id" params={{ id: a.id }}>
                {a.name}
              </Link>
              <span className="kmeta">
                {ACCOUNT_TYPE_LABEL[a.type]}
                {a.pendingCount > 0 && <span>{a.pendingCount} vorgemerkt</span>}
              </span>
              <span
                className={cx('kmeta', 'kcheck', check.stale && 'is-stale')}
                data-review-state={check.state}
              >
                {check.stale && (
                  <AlertTriangle
                    size={14}
                    strokeWidth={1.75}
                    role="img"
                    aria-label="Prüfung fällig"
                  />
                )}
                {check.text}
              </span>
              {shown?.cashCents != null && (
                <span
                  className={cx('kmeta', shown.cashCents < 0 && 'is-neg')}
                  data-testid="depot-own-cash"
                >
                  Cash im Depot {eur(shown.cashCents)}
                  <ValuationSourceHint
                    sources={a.valuationSources?.filter((source) => source.securityId === null)}
                    label={`Cash · ${a.name}`}
                  />
                </span>
              )}
              {shown?.includedCashCents != null && (
                <span
                  className={cx('kmeta', shown.includedCashCents < 0 && 'is-neg')}
                  data-testid="included-depot-cash"
                >
                  inkl. Cash im Depot {eur(shown.includedCashCents)}
                  <ValuationSourceHint
                    sources={sourcesByRow.get(a.id)?.filter((source) => source.accountId !== a.id)}
                    label={`Depot-Cash · ${a.name}`}
                  />
                </span>
              )}
              <BankBalance account={a} />
              {util !== null && a.creditLimitCents !== null && (
                <span className="kutil">
                  <ChartValue
                    label={`Kreditnutzung ${a.name}`}
                    date={points?.at(-1)?.date ?? todayInVienna()}
                    series={[
                      {
                        name: 'Genutzt',
                        value: nativeCurrency(Math.max(0, -a.balanceCents), a.currency),
                        color: 'var(--line)',
                      },
                      {
                        name: 'Rahmen',
                        value: nativeCurrency(a.creditLimitCents, a.currency),
                        color: 'var(--line-2)',
                      },
                      {
                        name: 'Auslastung',
                        value: `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(util * 100)} %`,
                      },
                    ]}
                  >
                    <span className="pbar" aria-hidden="true">
                      <i className="pbar-fill" style={{ width: `${util * 100}%` }} />
                    </span>
                  </ChartValue>
                  {Math.round(util * 100)} % von{' '}
                  {nativeCurrencyWhole(a.creditLimitCents, a.currency)} Limit
                </span>
              )}
            </td>
            <td className="kc-line">
              {points && <MiniLine points={points} currency={a.currency} />}
              {delta !== null && (
                <span className="kdelta">
                  {Math.abs(delta) < 50
                    ? privateAmount(`±0 ${a.currency}`)
                    : nativeCurrencyWhole(delta, a.currency, true)}
                </span>
              )}
            </td>
            <td className={cx('kc-num', value !== null && value < 0 && 'is-neg')}>
              <span
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                <span
                  data-testid="account-value"
                  style={
                    value === null
                      ? { minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }
                      : { whiteSpace: 'nowrap' }
                  }
                >
                  {value === null
                    ? loading && !shown?.approx
                      ? '–'
                      : valuationMissingText(a)
                    : `${shown?.approx && !a.valuationSources ? '≈ ' : ''}${eur(value)}`}
                </span>
                <ValuationSourceHint sources={sourcesByRow.get(a.id)} label={a.name} />
              </span>
            </td>
            {ordering && <td className="kc-order">{reorder.controls(a.id)}</td>}
          </tr>
        );
      })}
    </>
  );
}
