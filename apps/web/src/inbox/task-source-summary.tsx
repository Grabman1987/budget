import { Button } from '@budget/ui';
import type { InboxTaskSource } from '@budget/domain';
import { Fragment, type ReactNode } from 'react';
import { Landmark, NotebookPen, Receipt, FileText, CircleHelp } from 'lucide-react';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import type { PlanTaskState } from './plan-task-state';

export function TaskSourceSummary({
  counts,
  selected,
  onSelect,
  renderDetail,
  planState,
}: {
  counts: Record<InboxTaskSource, number>;
  selected: InboxTaskSource | undefined;
  onSelect: (source: InboxTaskSource | undefined) => void;
  /** Redesign (#1345): the opened source unfolds directly under its own row. */
  renderDetail?: ((source: InboxTaskSource) => ReactNode) | undefined;
  /** Redesign: open plan problems (the same ones Heute lists under "Als Nächstes"). */
  planState?: PlanTaskState | undefined;
}) {
  const planProblems: string[] = [];
  if (REDESIGN_ENABLED && planState) {
    if (planState.overspentCount > 0)
      planProblems.push(
        `${planState.overspentCount} ${planState.overspentCount === 1 ? 'Kategorie' : 'Kategorien'} überzogen`,
      );
    if ((planState.assignmentCents ?? 0) < 0) planProblems.push('zu viel zugewiesen');
  }
  const planLink = planProblems.length
    ? planState!.overspentCount > 0
      ? { search: { monat: planState!.month, ansicht: 'triage' } }
      : { search: { monat: planState!.month, ablauf: 'verteilen' } }
    : undefined;
  return (
    <table
      className={`rev-table inbox-task-sources${REDESIGN_ENABLED ? ' inbox-task-sources-v1' : ''}`}
    >
      <caption className="sr-only">Alle offenen Aufgaben nach Quelle</caption>
      <thead className={REDESIGN_ENABLED ? 'sr-only' : undefined}>
        <tr>
          <th scope="col">Quelle</th>
          <th scope="col">Offen</th>
          <th scope="col">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            ['accounts', 'Konten prüfen'],
            ['plan', 'Plan'],
            ['receipts', 'Belege ohne Buchung'],
            ['payslips', 'Gehaltszettel'],
            ['other', 'Weitere Aufgaben'],
          ] as const
        ).map(([source, label]) => {
          const Icon = {
            accounts: Landmark,
            plan: NotebookPen,
            receipts: Receipt,
            payslips: FileText,
            other: CircleHelp,
          }[source];
          const planOpen = source === 'plan' && planProblems.length > 0;
          const count = counts[source] + (planOpen ? planProblems.length : 0);
          const detail = {
            accounts: 'Kontostand und Prüfung',
            plan: planOpen ? planProblems.join(' · ') : 'Plan und wiederkehrende Zahlungen',
            receipts: 'Belege einer Buchung zuordnen',
            payslips: 'Gehaltszettel prüfen',
            other: 'Daten und Quellen prüfen',
          }[source];
          // Redesign (#1345): nothing open means nothing to click, a plain muted row.
          const empty = REDESIGN_ENABLED && count === 0 && selected !== source;
          const detailContent = selected === source ? renderDetail?.(source) : null;
          return (
            <Fragment key={source}>
              <tr className={empty ? 'inbox-task-row-empty' : undefined}>
                <th scope="row">
                  {REDESIGN_ENABLED ? (
                    <span className="inbox-task-title">
                      <Icon size={18} aria-hidden="true" />
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </span>
                  ) : (
                    label
                  )}
                </th>
                <td>
                  {REDESIGN_ENABLED ? (
                    <span className="inbox-task-count">{count}</span>
                  ) : (
                    counts[source]
                  )}
                </td>
                <td>
                  {empty ? (
                    <span className="inbox-task-none">Nichts offen</span>
                  ) : planOpen && counts.plan === 0 && planLink ? (
                    <AppLink
                      className="btn btn-ghost btn-sm"
                      to="/plan/monat"
                      search={planLink.search}
                      aria-label={`Prüfen · ${label}`}
                    >
                      Prüfen
                    </AppLink>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={
                        source !== 'receipts' && counts[source] === 0 && selected !== source
                      }
                      aria-expanded={selected === source}
                      aria-label={
                        REDESIGN_ENABLED
                          ? `${selected === source ? 'Schließen' : source === 'receipts' ? 'Zuordnen' : 'Prüfen'} · ${label}`
                          : `${label} ${selected === source ? 'schließen' : 'öffnen'}`
                      }
                      onClick={() => onSelect(selected === source ? undefined : source)}
                    >
                      {selected === source
                        ? 'Schließen'
                        : REDESIGN_ENABLED
                          ? source === 'receipts'
                            ? 'Zuordnen'
                            : 'Prüfen'
                          : 'Öffnen'}
                    </Button>
                  )}
                </td>
              </tr>
              {detailContent && (
                <tr className="inbox-task-detail">
                  <td colSpan={3}>
                    {detailContent}
                    {planOpen && planLink && (
                      <p className="inbox-plan-link">
                        <AppLink to="/plan/monat" search={planLink.search}>
                          Im Plan prüfen →
                        </AppLink>
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
