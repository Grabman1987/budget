import { useLocation, useRouter } from '@tanstack/react-router';
import { AppLink } from '../shell/app-link';
import './report-detail.css';

declare module '@tanstack/history' {
  interface HistoryState {
    reportDetailOpenedInApp?: boolean;
  }
}

export function ReportDetailNav({
  to,
  search,
  report,
  title,
  backLabel,
}: {
  to: string;
  search: Record<string, unknown>;
  report: string;
  title: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const opened = useLocation({ select: (location) => location.state.reportDetailOpenedInApp });
  return (
    <div className="report-detail-nav">
      <nav aria-label="Brotkrumen">
        <AppLink to="/reports">Reports</AppLink>
        {' › '}
        <AppLink to={to} search={search}>
          {report}
        </AppLink>
        {' › '}
        <span aria-current="page">{title}</span>
      </nav>
      <AppLink
        to={to}
        search={search}
        onClick={(event) => {
          if (opened && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            router.history.back();
          }
        }}
      >
        {backLabel ?? `Zurück zum ${report}`}
      </AppLink>
    </div>
  );
}
