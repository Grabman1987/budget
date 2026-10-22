import { maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { longDay } from '../ledger/format';

export interface ReportProjectDescriptor { id: string; name: string; archived: boolean }

/** Label the actual server scope; URL text alone never proves a resolved project. */
export function ReportProjectScopeNote({ project, asOf, view }: {
  project?: ReportProjectDescriptor | undefined;
  asOf: string;
  view: 'income' | 'overview' | 'cashflow';
}) {
  useAmountPrivacy();
  if (!project) return null;
  return <p className="report-project-note" data-project-id={project.id}>
    <strong>Projekt: {maskMoneyText(project.name)}{project.archived ? ' · archiviert' : ''}.</strong>{' '}
    Stand {longDay(asOf)} · tatsächlich zugeordnete Buchungen.
    {view === 'income' && ' Erwartete Zahlungen sind nicht projektbezogen zuordenbar.'}
    {view === 'overview' && ' Zuweisungen, Geldalter, Vermögen und Regelziele sind nicht projektbezogen verfügbar.'}
    {view === 'cashflow' && ' Kapitalerträge bleiben getrennt vom Haushaltseinkommen und Netto-Cashflow.'}
  </p>;
}
