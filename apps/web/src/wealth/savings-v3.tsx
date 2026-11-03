import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@budget/ui';
import type { AccountRow as AccountView } from '../ledger/types';
import type { SecurityRecord } from './portfolio-api';
import type { SavingsPlanRecord } from './savings-api';
import {
  currentRates,
  nextPlanExecution,
  type planGroups,
  planPurchases,
  savingsMonthStrip,
} from './savings-model';
import { tradesQuery } from './trade-api';
import { longDay, nativeCurrency } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { moneyText } from './portfolio-format';
import { AppLink } from '../shell/app-link';

type Group = ReturnType<typeof planGroups>[number];
export function SavingsV3({
  groups,
  accounts,
  securities,
  today,
  onSelect,
}: {
  groups: Group[];
  accounts: AccountView[];
  securities: SecurityRecord[];
  today: string;
  onSelect: (id: string, trigger?: HTMLButtonElement) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const totals = currentRates(groups, accounts);
  const group = groups.find((group) => group.latest.id === selected) ?? groups[0];
  const name = (group: Group) =>
    securities.find((row) => row.id === group.latest.securityId)?.name ??
    'Instrument nicht verfügbar';
  return (
    <div className="wealth-savings-v3">
      <div className="wealth-savings-lead">
        <h2>Monatlich gesamt</h2>
        <div className="wealth-figure">
          {totals.size
            ? [...totals]
                .map(([currency, amount]) =>
                  amount === null
                    ? `${currency}: Summe nicht verfügbar`
                    : nativeCurrency(amount, currency),
                )
                .join(' · ')
            : '—'}
        </div>
        <Button
          variant="ghost"
          data-savings-plan="neu"
          onClick={(event) => onSelect('neu', event.currentTarget)}
        >
          + Sparplan
        </Button>
      </div>
      <div className="wealth-savings-columns">
        <div>
          <table className="wealth-table wealth-savings-table">
            <thead>
              <tr>
                {['Instrument', 'Rate', 'Intervall', 'Nächste', 'Letzte 12 Monate', ''].map(
                  (label) => (
                    <th key={label} scope="col">
                      {label || <span className="sr-only">Aktionen</span>}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((row) => {
                const account = accounts.find((item) => item.id === row.latest.accountId);
                const next = nextPlanExecution(row.rows, today);
                return (
                  <tr key={row.latest.id} data-selected={row === group ? '1' : undefined}>
                    <th scope="row">
                      <button
                        type="button"
                        className="portfolio-product"
                        onClick={() => setSelected(row.latest.id)}
                      >
                        {name(row)}
                        <small>{account?.name ?? 'Konto nicht verfügbar'}</small>
                      </button>
                    </th>
                    <td className="num" data-label="Rate">
                      {row.current && account
                        ? nativeCurrency(row.current.amountCents, account.currency)
                        : row.ambiguous
                          ? 'Nicht eindeutig'
                          : '—'}
                    </td>
                    <td data-label="Intervall">
                      monatlich{row.current && <small>am {row.current.dayOfMonth}.</small>}
                    </td>
                    <td data-label="Nächste">{next ? longDay(next.date) : '—'}</td>
                    <td>
                      <ExecutionStrip rows={row.rows} today={today} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        data-savings-plan={row.editable?.id ?? row.latest.id}
                        onClick={() => onSelect(row.editable?.id ?? row.latest.id)}
                      >
                        Rate ändern
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>Summe</th>
                <td colSpan={5}>
                  {[...totals]
                    .map(([currency, amount]) =>
                      amount === null ? 'Nicht verfügbar' : nativeCurrency(amount, currency),
                    )
                    .join(' · ')}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="wealth-strip-legend">
            ■ zugeordnet ausgeführt · ◇ Zuordnung prüfen · □ offen · — nicht geplant
          </p>
          {!groups.length && <p>Keine laufenden oder vorgemerkten Sparpläne.</p>}
        </div>
        {group && (
          <PlanCard
            key={group.latest.id}
            group={group}
            name={name(group)}
            account={accounts.find((row) => row.id === group.latest.accountId)}
            today={today}
            onEdit={() => onSelect(group.editable?.id ?? group.latest.id)}
          />
        )}
      </div>
    </div>
  );
}
function ExecutionStrip({ rows, today }: { rows: SavingsPlanRecord[]; today: string }) {
  const query = useQuery(tradesQuery(rows[0]!.securityId));
  if (!query.isSuccess)
    return <span className="vnote">{query.isError ? 'Nicht verfügbar' : 'Wird geladen …'}</span>;
  const labels = {
    executed: 'Zugeordnet ausgeführt',
    open: 'Offen',
    missing_link: 'Zuordnung fehlt',
    ambiguous: 'Zuordnung prüfen',
    not_planned: 'Nicht geplant',
  };
  return (
    <span className="wealth-execution-strip" aria-label="Letzte zwölf Monate">
      {savingsMonthStrip(rows, query.data.trades, today).map((slot) => (
        <i
          key={slot.month}
          data-state={slot.status}
          title={`${slot.month}: ${labels[slot.status]}`}
        >
          <span className="sr-only">
            {slot.month}: {labels[slot.status]}.{' '}
          </span>
          {slot.status === 'ambiguous' || slot.status === 'missing_link'
            ? '◇'
            : slot.status === 'not_planned'
              ? '−'
              : ''}
        </i>
      ))}
    </span>
  );
}
function PlanCard({
  group,
  name,
  account,
  today,
  onEdit,
}: {
  group: Group;
  name: string;
  account: AccountView | undefined;
  today: string;
  onEdit: () => void;
}) {
  const query = useQuery(tradesQuery(group.latest.securityId));
  const purchases = planPurchases(group.rows, query.data?.trades ?? [], today);
  const next = nextPlanExecution(group.rows, today);
  const money = (value: number | null) =>
    value === null || !account ? 'Nicht verfügbar' : nativeCurrency(value, account.currency);
  return (
    <section className="wealth-sheet wealth-plan-card" aria-label={`${name} · Plan`}>
      <div className="wealth-section-head">
        <h2>{name} · Plan</h2>
        <button type="button" onClick={onEdit}>
          Bearbeiten
        </button>
      </div>
      <dl>
        {group.rows.map((row) => (
          <div key={row.id}>
            <dt>
              Rate ab {longDay(row.validFrom)}
              {row.validTo && ` bis ${longDay(row.validTo)}`}
            </dt>
            <dd>{money(row.amountCents)}</dd>
          </div>
        ))}
        <div>
          <dt>Intervall</dt>
          <dd>monatlich, am {group.current?.dayOfMonth ?? group.latest.dayOfMonth}.</dd>
        </div>
        <div>
          <dt>Nächste Ausführung</dt>
          <dd>{next ? longDay(next.date) : 'Nicht eindeutig'}</dd>
        </div>
        <div>
          <dt>Erfasste Käufe seit Beginn</dt>
          <dd>{query.isSuccess ? money(purchases.totalCents) : '—'}</dd>
        </div>
        <div>
          <dt>Kontowert · EUR</dt>
          <dd>{moneyText(account?.valueEurCents ?? null)}</dd>
        </div>
      </dl>
      {query.isPending && <LoadingNote what="Käufe" />}
      {query.isError && (
        <ErrorNote what="Käufe" error={query.error} onRetry={() => void query.refetch()} />
      )}
      <p className="vnote">
        Käufe einschließlich manueller Käufe; Kontowert kann weitere Anlagen enthalten.{' '}
        <AppLink to={`/vermoegen/portfolio/sparplan/${encodeURIComponent(group.latest.id)}`}>
          Verlauf, Beenden und Ausführungen →
        </AppLink>
      </p>
    </section>
  );
}
