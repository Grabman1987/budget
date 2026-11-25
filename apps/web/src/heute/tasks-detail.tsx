import { RevisionTriangle, useAmountPrivacy, type RevisionRow } from '@budget/ui';
import type { ReactNode } from 'react';
import { eur, shortDay } from '../ledger/format';
import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import type { Heute } from './api';
import { attentionModel } from './attention-model';

interface TaskRow {
  id: string;
  what: string;
  when?: ReactNode;
  urgent?: boolean;
  action: { label: string; to: string; search?: Record<string, string>; hash?: string };
}

/** "Als Nächstes · alle Aufgaben": one line per task, the urgent ones first. */
export function TasksDetail({
  data,
  savingsRows,
  inboxWarning,
}: {
  data: Heute;
  savingsRows: RevisionRow[];
  inboxWarning: string | null;
}) {
  useAmountPrivacy();
  const month = data.stand.today.slice(0, 7);
  const model = attentionModel(data, { count: savingsRows.length, unavailable: false });
  const rows: TaskRow[] = [];
  for (const task of model.tasks) {
    switch (task.kind) {
      case 'plan': {
        const over = data.nextSteps.items.filter((item) => item.kind === 'overspent');
        rows.push({
          id: task.id,
          what: over.length === 1 ? '1 Kategorie überzogen' : `${over.length} Kategorien überzogen`,
          when: eur(
            over.reduce((sum, item) => sum + item.cents, 0),
            { cents: false },
          ),
          urgent: true,
          action: {
            label: 'Decken',
            to: '/plan/monat',
            search: { monat: month, ansicht: 'triage' },
          },
        });
        break;
      }
      case 'month-close':
        rows.push({
          id: task.id,
          what: task.task.kind === 'close' ? 'Monat abschließen' : 'Nach Abschluss geändert',
          when: monthLabel(task.task.month),
          urgent: task.task.kind !== 'close',
          action: { label: 'Öffnen', to: task.task.target },
        });
        break;
      case 'rules': {
        const bad =
          'unavailable' in data.financeCheck
            ? []
            : data.financeCheck.actionRules.filter((rule) => rule.status === 'bad');
        rows.push({
          id: task.id,
          what: 'Regelbefunde',
          when: String(bad.length),
          urgent: true,
          action: {
            label: 'Handeln',
            to: '/einstellungen/regelwerk',
            hash: `rule-result-${bad[0]?.code ?? ''}`,
          },
        });
        break;
      }
      case 'review': {
        const uncategorized = data.nextSteps.items.find((item) => item.kind === 'uncategorized');
        if (data.attention.inboxCount > 0)
          rows.push({
            id: 'review:inbox',
            what: 'Unter Prüfen',
            when: (
              <>
                {data.attention.inboxCount}
                {uncategorized ? ` · ${eur(uncategorized.cents)} ohne Kategorie` : ''}
                {inboxWarning ? ` · ${inboxWarning}` : ''}
              </>
            ),
            action: { label: 'Zuordnen', to: '/konten/pruefen' },
          });
        if (data.attention.pendingCount > 0)
          rows.push({
            id: 'review:pending',
            what: 'Unbestätigte Buchungen',
            when: `${data.attention.pendingCount} · bis ${shortDay(data.attention.pendingBefore)}`,
            action: {
              label: 'Bestätigen',
              to: '/konten/buchungen',
              search: { status: 'pending', bis: data.attention.pendingBefore },
            },
          });
        if (savingsRows.length > 0)
          rows.push({
            id: 'review:savings',
            what: 'Sparplanausführungen',
            when: String(savingsRows.length),
            action: { label: 'Prüfen', to: '/konten/pruefen', search: { teil: 'aufgaben' } },
          });
        break;
      }
      case 'accounts': {
        const reminders = data.accountReminders?.length ?? 0;
        const quotes = data.attention.quoteReview?.count ?? 0;
        if (reminders > 0)
          rows.push({
            id: 'accounts:reminders',
            what: 'Konten warten auf Prüfung',
            when: String(reminders),
            action: { label: 'Prüfen', to: '/konten/pruefen', hash: 'account-reminder-title' },
          });
        if (quotes > 0)
          rows.push({
            id: 'accounts:quotes',
            what: 'Wertpapiere ohne Kurs',
            when: String(quotes),
            action: { label: 'Kurse prüfen', to: '/vermoegen/portfolio/positionen' },
          });
        if (data.attention.loanTermsMissing)
          rows.push({
            id: 'accounts:loan',
            what: 'Kreditkonditionen fehlen',
            action: { label: 'Ergänzen', to: '/einstellungen/konten' },
          });
        break;
      }
      case 'contact':
        rows.push({
          id: task.id,
          what: task.contact.contactName,
          when: `${eur(task.contact.overdueCents)} · seit ${shortDay(task.contact.oldestDate)}`,
          action: {
            label: 'Kontoblatt',
            to: `/konten/kontakte/${encodeURIComponent(task.contact.contactId)}`,
          },
        });
        break;
    }
  }
  if (!rows.length) return <p className="hv-quiet">Keine offenen Aufgaben.</p>;
  // Explicit roles keep the table semantics where the phone CSS turns the table into a grid.
  /* eslint-disable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
  return (
    <section className="card hv-due-card hv-tasks-card" aria-label="Aufgaben">
      <table className="hv-due-table hv-tasks-table" role="table">
        <caption className="sr-only">Offene Aufgaben</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              Aufgabe
            </th>
            <th scope="col" role="columnheader">
              Wann / Betrag
            </th>
            <th scope="col" role="columnheader">
              Aktion
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, index) => (
            <tr key={row.id} role="row" className={row.urgent ? 'is-urgent' : undefined}>
              <td role="cell" className="hv-task-what">
                <RevisionTriangle
                  letter={String.fromCharCode(65 + (index % 26))}
                  urgent={row.urgent ?? false}
                />
                {row.what}
              </td>
              <td role="cell" className="hv-task-when">
                {row.when}
              </td>
              <td role="cell" className="hv-task-action">
                <AppLink to={row.action.to} search={row.action.search} hash={row.action.hash}>
                  {row.action.label} →
                </AppLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
/* eslint-enable jsx-a11y/no-redundant-roles, jsx-a11y/no-interactive-element-to-noninteractive-role */
