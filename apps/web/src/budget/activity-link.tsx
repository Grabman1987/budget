import { monthLabel } from '../nav/month';
import { AppLink } from '../shell/app-link';
import { eur } from '../ledger/format';

export function ActivityLink({
  month,
  id,
  name,
  cents,
}: {
  month: string;
  id: string;
  name: string;
  cents: number;
}) {
  return (
    <AppLink
      className="activity-link"
      to={`/plan/monat/envelope/${encodeURIComponent(id)}`}
      search={{ monat: month }}
      state={{ planDetailOpenedInApp: true }}
      aria-label={`Aktivität ${name} · ${monthLabel(month)}: ${eur(cents)}`}
      onClick={(event) => {
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        window.history.replaceState({ ...window.history.state, planInspector: { id, month } }, '');
      }}
    >
      {eur(cents)}
    </AppLink>
  );
}
