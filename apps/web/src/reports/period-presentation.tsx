import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { Button } from '@budget/ui';
import { isPaperPresentation } from './report-search';

export function usePaperView() {
  const search = useSearch({ strict: false }) as { darstellung?: string };
  return isPaperPresentation(search.darstellung, useLocation().hash);
}
/** Presentation only; all source/month/period intent remains in the existing validated search. */
export function PeriodPresentation({ monthly = false }: { monthly?: boolean }) {
  const navigate = useNavigate();
  const go = (next: string) =>
    void navigate({
      to: monthly ? '/reports/onepager' : '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        darstellung: next === 'summary' ? undefined : next,
      })) as never,
      hash: '',
    });
  return (
    <Button variant="ghost" onClick={() => go('druckblatt')}>
      A4 Druckblatt und alle Details öffnen
    </Button>
  );
}
