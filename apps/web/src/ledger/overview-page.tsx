import { addDays, cents, todayInVienna } from '@budget/domain';
import { Button, CircleNumber, DimensionChain, type DimensionChainTerm, cx } from '@budget/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { PageFrame } from '../pages/placeholder-page';
import { KONTEN_META } from '../nav/pages';
import { AccountFormPanel } from './account-form';
import { fetchAccounts } from './api';
import { eur, eurParts, eurWhole, nativeCurrencyWhole } from './format';
import { ACCOUNT_TYPE_LABEL, accountValueEur } from './labels';
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
const WINDOW_DAYS = 30;

/** Konten › Übersicht: net worth with its chain by group, then the parts list of the accounts. */
export function OverviewPage() {
  const accounts = useQuery(accountsQuery());
  const [creating, setCreating] = useState(false);
  const model = accounts.data ? overviewModel(accounts.data.accounts) : undefined;

  return (
    <PageFrame meta={META}>
      <div className="kview">
        <div className="kbar">
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
            <AccountsTable model={model} />
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
  const before = addDays(asOf, -WINDOW_DAYS);
  const prior = useQuery({
    queryKey: [...LEDGER_KEY, 'accounts', before],
    queryFn: () => fetchAccounts(before),
  });
  const change = prior.data ? netWorthChange(accounts, prior.data.accounts, before) : null;

  const jump = (target: string) => () => {
    const row = document.getElementById(target === 'closed' ? 'kaccts-closed' : `kg-${target}`);
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    row.classList.add('is-flash');
    window.setTimeout(() => row.classList.remove('is-flash'), 900);
  };
  const terms: DimensionChainTerm[] = [];
  if (model.netWorthCents !== null && model.closedValueCents !== null) {
    const sum = (role: string) => model.groups.find((g) => g.group.role === role)?.sumCents;
    const push = (
      label: string,
      role: string,
      value: number | null | undefined,
      op?: '+' | '-',
    ) => {
      if (value == null) return;
      if (!model.groups.some((g) => g.group.role === role)) return;
      terms.push({
        label,
        value: cents(value),
        ...(op ? { op } : {}),
        onSelect: jump(role),
      });
    };
    push('Budget-Konten', 'budget', sum('budget'));
    push('Sparen', 'reserve', sum('reserve'), '+');
    push('Investment', 'investment', sum('investment'), '+');
    const debt = sum('debt');
    push('Schulden', 'debt', debt == null ? undefined : -debt, '-');
    push('Forderungen', 'receivable', sum('receivable'), '+');
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
          EUR-Wert nicht verfügbar · Wechselkurs fehlt: {model.missingFxCurrencies.join(', ')}
        </p>
      ) : (
        <DimensionChain terms={terms} label="Maßkette Nettovermögen nach Kontogruppen" />
      )}
    </section>
  );
}

function AccountsTable({ model }: { model: ReturnType<typeof overviewModel> }) {
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
      <table className="ktable">
        <caption className="sr-only">Konten mit Saldo und Verlauf der letzten 30 Tage</caption>
        <thead>
          <tr>
            <th className="tech kc-pos" scope="col">
              Pos.
            </th>
            <th className="tech" scope="col">
              Konto
            </th>
            <th className="tech kc-line" scope="col">
              30 Tage
            </th>
            <th className="tech kc-num" scope="col">
              Wert in EUR
            </th>
          </tr>
        </thead>
        <tbody>
          {model.groups.map((g, gi) => (
            <GroupRows key={g.group.role} view={g} index={gi + 1} series={byId} />
          ))}
        </tbody>
      </table>
      {model.closed.length > 0 && (
        <p className="ksum" id="kaccts-closed">
          Geschlossen:{' '}
          {model.closed.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <Link to="/konten/$id" params={{ id: a.id }}>
                {a.name}
              </Link>
              {': '}
              {accountValueEur(a) === null
                ? `Kurs fehlt (${a.missingFxCurrencies.join(', ')})`
                : eur(accountValueEur(a)!)}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function GroupRows({
  view,
  index,
  series,
}: {
  view: GroupView;
  index: number;
  series: Map<string, SeriesPoint[]>;
}) {
  return (
    <>
      <tr className="kgroup" id={`kg-${view.group.role}`}>
        <td className="kc-pos">
          <CircleNumber n={index} size="sm" />
        </td>
        <td>
          <span className="grp-title">{view.group.title}</span>
          <span className="grp-sub">{view.group.sub}</span>
        </td>
        <td className="kc-line" />
        <td className="kc-num">{view.sumCents === null ? 'Kurs fehlt' : eur(view.sumCents)}</td>
      </tr>
      {view.accounts.map((a, i) => {
        const points = series.get(a.id);
        const delta = points ? seriesChange(points) : null;
        const util = utilisation(a);
        const value = accountValueEur(a);
        return (
          <tr className="krow" key={a.id}>
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
                    ? `±0 ${a.currency}`
                    : nativeCurrencyWhole(delta, a.currency, true)}
                </span>
              )}
            </td>
            <td className={cx('kc-num', value !== null && value < 0 && 'is-neg')}>
              {value === null ? `Kurs fehlt (${a.missingFxCurrencies.join(', ')})` : eur(value)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
