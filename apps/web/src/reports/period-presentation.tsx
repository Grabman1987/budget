import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@budget/ui';
import { isPaperPresentation } from './report-search';

export function usePaperView() {
  const search = useSearch({ strict: false }) as { darstellung?: string };
  return isPaperPresentation(search.darstellung, useLocation().hash);
}
/** Presentation only; all source/month/period intent remains in the existing validated search. */
export function PeriodPresentation({
  monthly = false,
  linkOnly = false,
}: {
  monthly?: boolean;
  linkOnly?: boolean;
}) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { darstellung?: string };
  const paperView = usePaperView();
  const value =
    search.darstellung === 'finanzcheck' ? 'finanzcheck' : paperView ? 'druckblatt' : 'summary';
  const go = (next: string) =>
    void navigate({
      to: monthly ? '/reports/onepager' : '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        darstellung: next === 'summary' ? undefined : next,
      })) as never,
      hash: '',
    });
  if (linkOnly)
    return (
      <Button variant="ghost" onClick={() => go('druckblatt')}>
        A4 Druckblatt und alle Details öffnen
      </Button>
    );
  return (
    <label className="period-presentation">
      <span className="sr-only">Darstellung</span>
      <select value={value} onChange={(event) => go(event.target.value)}>
        <option value="summary">{monthly ? 'Monats-One-Pager' : 'Jahresbericht'}</option>
        {monthly && <option value="finanzcheck">Finanz-Check-Verlauf</option>}
        <option value="druckblatt">A4 Druckblatt · alle Details</option>
      </select>
    </label>
  );
}
