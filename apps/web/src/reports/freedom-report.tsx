import { useQuery } from '@tanstack/react-query';
import { cents } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import type { ReactNode } from 'react';
import { longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { FreedomContent } from '../wealth/freedom-page';
import { freedomGoalQuery, freedomQuery } from '../wealth/freedom-api';
import { ReportFrame } from './report-frame';
import './freedom-report.css';

/** Compose the complete reader/editor; assumptions, saved goals and Undo keep their original path. */
export function FreedomReport({
  report,
  meta,
  viewControl,
}: {
  report: ReportEntry;
  meta: PageMeta;
  viewControl?: ReactNode;
}) {
  useAmountPrivacy();
  const query = useQuery(freedomQuery());
  const goal = useQuery(freedomGoalQuery());
  const view = query.isSuccess && !query.isError ? query.data : undefined;
  return (
    <ReportFrame
      meta={meta}
      title={report.name}
      subtitle="Investiertes Vermögen geteilt durch das Ziel aus Jahresausgaben. Annahmen sind keine Garantie."
      sourceDate={view?.asOf}
      reportDataBasis={
        view
          ? `Ausgaben aus ${view.months.length} abgeschlossenen Monaten · Bewertung ${longDay(view.asOf)}`
          : query.isError
            ? 'nicht verfügbar'
            : 'wird geladen'
      }
      reportControls={viewControl}
      calculation={
        view && !query.isFetching
          ? {
              label: 'Investiert geteilt durch Ziel',
              terms: [
                ...(view.investedCents !== null
                  ? [{ label: 'Investiert', value: cents(view.investedCents) }]
                  : []),
                ...(view.targetCents !== null
                  ? [
                      {
                        label: `÷ Ziel (${view.multiple} Jahresausgaben)`,
                        value: cents(view.targetCents),
                      },
                    ]
                  : []),
              ],
              result: {
                label: 'Freiheitszahl · Ziel 100 %',
                unit: 'percent',
                value: view.progressBp,
              },
            }
          : undefined
      }
    >
      <div className="kview vview freedom-view freedom-report">
        {query.isPending && <LoadingNote what="Freiheitszahl" />}
        {query.isError && (
          <ErrorNote
            what="Freiheitszahl"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
        {view && (
          <FreedomContent
            view={view}
            goalRequest={{
              state: goal.data,
              pending: goal.isPending,
              error: goal.isError,
              refresh: async () => {
                const fresh = await goal.refetch();
                return fresh.isError ? undefined : fresh.data;
              },
            }}
          />
        )}
      </div>
    </ReportFrame>
  );
}
