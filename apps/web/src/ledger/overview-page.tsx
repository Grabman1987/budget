import { BankBalance } from './bank-balance';
import {
  useAmountPrivacy,
  privateAmount,
  Button,
  CircleNumber,
  DimensionChain,
  type DimensionChainTerm,
  cx,
} from '@budget/ui';
import { addDays, cents, todayInVienna } from '@budget/domain';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, Pencil, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { PageFrame } from '../pages/placeholder-page';
import { KONTEN_META } from '../nav/pages';
import { AccountFormPanel } from './account-form';
import { useOrderedAccounts, useReorder } from './account-order';
import { fetchAccounts } from './api';
import { eur, eurParts, eurWhole, nativeCurrencyWhole } from './format';
import {
  ACCOUNT_TYPE_LABEL,
  accountValueEur,
  valuationMissingText,
  type AccountGroupId,
} from './labels';
import { MiniLine } from './mini-line';
import {
  netWorthChange,
  overviewModel,
  seriesChange,
  utilisation,
  type GroupView,
} from './overview-model';
import { accountsQuery, LEDGER_KEY, seriesQuery } from './queries';
import { EmptyNote, ErrorNote, LoadingNote } from './states';
import type { AccountRow, SeriesPoint } from './types';

const META = KONTEN_META;
/** Window of the sparklines and of the net-worth change figure. */
const WINDOW_DAYS = 90;

/** Konten › Übersicht: net worth with its chain by group, then the parts list of the accounts. */
export function OverviewPage() {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const ordered = useOrderedAccounts(accounts.data?.accounts);
  const model = ordered.accounts ? overviewModel(ordered.accounts) : undefined;

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
            <AccountsTable model={model} ordering={ordering} onReorder={ordered.save} />
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
  if (model.netWorthCents !== null && model.closedValueCents !== null) {
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
      <div className="tbd-fig" data-testid="net-worth">
        {parts ? (
          <>
            {parts.whole}
            <span className="cents">,{parts.fraction} €</span>
          </>
        ) : (
          <span>Nicht verfügbar</span>
        )}
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
  ordering,
  onReorder,
}: {
  model: ReturnType<typeof overviewModel>;
  ordering: boolean;
  onReorder: (groupId: AccountGroupId, ids: string[]) => void;
}) {
  useAmountPrivacy();
  const open = model.groups.flatMap((g) => g.accounts);
  const series = useQueries({
    queries: open.map((a) => seriesQuery(a.id, WINDOW_DAYS)),
  });
  const byId = new Map<string, SeriesPoint[]>();
  open.forEach((a, i) => {
    const points = series[i]?.data?.points;
    if (points) byId.set(a.id, points);
  });

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
  index,
  series,
  ordering,
  onReorder,
}: {
  view: GroupView;
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
        <td className="kc-num">{view.sumCents === null ? 'Kurs fehlt' : eur(view.sumCents)}</td>
        {ordering && <td className="kc-order" />}
      </tr>
      {view.accounts.map((a, i) => {
        const points = series.get(a.id);
        const delta = points ? seriesChange(points) : null;
        const util = utilisation(a);
        const value = accountValueEur(a);
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
              <BankBalance account={a} />
              {util !== null && a.creditLimitCents !== null && (
                <span className="kutil">
                  <span className="pbar" aria-hidden="true">
                    <i className="pbar-fill" style={{ width: `${util * 100}%` }} />
                  </span>
                  {Math.round(util * 100)} % von{' '}
                  {nativeCurrencyWhole(a.creditLimitCents, a.currency)} Limit
                </span>
              )}
            </td>
            <td className="kc-line">
              {points && <MiniLine points={points} />}
              {delta !== null && (
                <span className="kdelta">
                  {Math.abs(delta) < 50
                    ? privateAmount(`±0 ${a.currency}`)
                    : nativeCurrencyWhole(delta, a.currency, true)}
                </span>
              )}
            </td>
            <td className={cx('kc-num', value !== null && value < 0 && 'is-neg')}>
              {value === null ? valuationMissingText(a) : eur(value)}
            </td>
            {ordering && <td className="kc-order">{reorder.controls(a.id)}</td>}
          </tr>
        );
      })}
    </>
  );
}
