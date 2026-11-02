import { cents } from '@budget/domain';
import { DimensionChain, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { occurrencesQuery } from '../expected/api';
import { budgetQuery } from '../budget/budget-api';
import { availableInEnvelopes, planRows } from '../budget/plan-model';
import { AppLink } from '../shell/app-link';
import { eur, longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { monthLabel } from '../nav/month';
import type { Heute, HeutePeriod } from './api';
import { DailyBudgetLine } from './charts';

export function LeadExplanation({ data }: { data: Heute }) {
  useAmountPrivacy();
  const source = useLocation({ select: (location) => location.href });
  const search = { monat: data.stand.today.slice(0, 7), period: data.stand.period, von: source };
  const earliestOpen = data.lead.items.open.map((item) => item.day).sort()[0] ?? data.stand.today;
  const payments = useQuery({
    ...occurrencesQuery(earliestOpen, data.stand.payday.day),
    enabled: data.lead.items.open.some((item) => !item.id.endsWith(`|${item.day}`)),
  });
  const labels = { need: 'Bedarf', want: 'Wunsch', open: 'Offen bis Gehalt' };
  return (
    <div className="heute-lead-explanation">
      <p>
        Frei bis Gehalt <strong>{eur(data.lead.freeCents)}</strong>
      </p>
      <p>
        EUR · Envelopes für Bedarf und Wunsch, abzüglich offener Rechnungen bis zum regelbasierten
        Gehalt am {longDay(data.stand.payday.day)}. Stand heute · {longDay(data.stand.today)}.
      </p>
      <p>
        Die Budgetprojektion bis Gehalt ist unabhängig vom Kontoguthaben und vom Überziehungsrahmen.
        Die Kontoprognose verwendet einen festen Zeitraum von 35 Tagen und keine Stellschrauben.
      </p>
      <section id="tagesbudget" aria-label="Tagesbudget bis Gehalt">
        <h3>Tagesbudget bis Gehalt</h3>
        <DailyBudgetLine data={data} />
        <p>
          {data.dailyBudget.perDayCents === null
            ? 'Ohne positiven Spielraum gibt es kein Tagesbudget.'
            : `${eur(data.lead.freeCents)} frei bis Gehalt, geteilt durch ${data.dailyBudget.remainingDays} verbleibende Tage einschließlich heute. Die Tagesanzeige ist auf ganze Euro gerundet.`}
        </p>
      </section>
      <div id="rechenweg">
        <DimensionChain
          terms={[
            { label: 'Bedarf', value: cents(data.lead.needCents) },
            { label: 'Wunsch', value: cents(data.lead.wantCents), op: '+' },
            { label: 'offen bis Gehalt', value: cents(data.lead.openCents), op: '-' },
            { label: 'frei verfügbar', value: cents(data.lead.freeCents), op: '=', result: true },
          ]}
          precision="cent"
          label="Bedarf plus Wunsch minus offene Rechnungen bis Gehalt"
        />
      </div>
      {(['need', 'want', 'open'] as const).map((kind) => (
        <section key={kind} className="heute-breakdown" aria-label={labels[kind]}>
          <h3>
            {labels[kind]} ·{' '}
            {eur(
              kind === 'need'
                ? data.lead.needCents
                : kind === 'want'
                  ? data.lead.wantCents
                  : -data.lead.openCents,
            )}
          </h3>
          {kind === 'open' ? (
            data.lead.items.open.length ? (
              <ul>
                {data.lead.items.open.map((item) => (
                  <li key={item.id}>
                    {(() => {
                      const payment =
                        !payments.isError &&
                        payments.data?.find(
                          (row) =>
                            (row.occurrenceId === item.id ||
                              `${row.paymentId}|${row.dueDate}` === item.id) &&
                            row.dueDate === item.day,
                        );
                      // Preview occurrences retain the canonical paymentId|dueDate identity.
                      const paymentId = item.id.endsWith(`|${item.day}`)
                        ? item.id.slice(0, -(item.day.length + 1))
                        : payment
                          ? payment.paymentId
                          : undefined;
                      return paymentId ? (
                        <AppLink
                          to={`/plan/erwartet/${encodeURIComponent(paymentId)}`}
                          search={search}
                        >
                          {item.label} · {longDay(item.day)}
                        </AppLink>
                      ) : (
                        <span>
                          {item.label} · {longDay(item.day)} ·{' '}
                          {payments.isPending
                            ? 'Quelle wird geladen'
                            : 'Quellverknüpfung nicht verfügbar'}
                        </span>
                      );
                    })()}
                    <strong>{eur(-item.cents)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>Keine offenen Rechnungen vor dem Gehalt.</EmptyNote>
            )
          ) : data.lead.items[kind].length ? (
            <ul>
              {data.lead.items[kind].map((item) => (
                <li key={item.id}>
                  <AppLink
                    to={`/plan/monat/envelope/${encodeURIComponent(item.id)}`}
                    search={search}
                  >
                    {item.name}
                  </AppLink>
                  <strong>{eur(item.availableCents)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote>Keine Envelopes in dieser Klasse.</EmptyNote>
          )}
        </section>
      ))}
      {payments.isError && (
        <ErrorNote
          what="Zahlungsquellen"
          error={payments.error}
          onRetry={() => void payments.refetch()}
        />
      )}
      <AppLink to="/plan/prognose" search={{ ...search, horizon: '35d', levers: '' }}>
        Kontoprognose · 35 Tage vergleichen
      </AppLink>
    </div>
  );
}

export function BudgetExplanation({ month, period }: { month: string; period: HeutePeriod }) {
  useAmountPrivacy();
  const source = useLocation({ select: (location) => location.href });
  const query = useQuery(budgetQuery(month));
  const data =
    !query.isError &&
    !(query.failureCount > 0) &&
    !query.isPlaceholderData &&
    query.data?.summary.month === month
      ? query.data
      : undefined;
  const rows = data ? planRows(data) : [];
  return (
    <div className="heute-breakdown">
      <p>
        EUR · Alle Envelopes im Planmonat {monthLabel(month)}. Zugewiesenes Geld und Aktivität,
        einschließlich Übertrag. Dies ist kein Kontoguthaben.
      </p>
      {query.isPending || (query.isFetching && !data) ? (
        <LoadingNote what="Budget" />
      ) : query.isError ? (
        <ErrorNote what="Budget" error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <p>
              Verfügbar im Budget <strong>{eur(availableInEnvelopes(rows))}</strong>
            </p>
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <AppLink
                    to={`/plan/monat/envelope/${encodeURIComponent(row.id)}`}
                    search={{ monat: month, period, von: source }}
                  >
                    {row.name}
                  </AppLink>
                  <strong>{eur(row.availableCents)}</strong>
                </li>
              ))}
            </ul>
            {!rows.length && <EmptyNote>Keine Envelopes in diesem Monat.</EmptyNote>}
          </>
        )
      )}
    </div>
  );
}
