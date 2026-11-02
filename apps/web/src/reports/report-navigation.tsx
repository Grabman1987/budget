import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLink } from '../shell/app-link';
import { HUB_REPORTS, hubReport, matchingHubReports } from './report-hub-model';
import './report-navigation.css';

export function adjacentReports(id: string) {
  const current = hubReport(id);
  const index = HUB_REPORTS.findIndex((r) => r.id === current?.id);
  return {
    previous: index > 0 ? HUB_REPORTS[index - 1] : undefined,
    next: index >= 0 ? HUB_REPORTS[index + 1] : undefined,
  };
}

/** Catalog order also crosses group boundaries. Alt+Shift avoids browser history shortcuts. */
export function ReportNavigation({ id }: { id: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const switcher = useRef<HTMLDetailsElement>(null);
  const matches = matchingHubReports(search);
  const current = hubReport(id);
  const { previous, next } = adjacentReports(id);
  const go = (reportId: string) =>
    void navigate({
      to: `/reports/${reportId}`,
      search: (prev: Record<string, unknown>) => ({
        zeitraum: prev['zeitraum'],
        trend: prev['trend'],
        monat: prev['monat'],
      }),
    } as never);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        switcher.current?.open &&
        e.target instanceof Node &&
        switcher.current.contains(e.target)
      ) {
        e.preventDefault();
        switcher.current.open = false;
        switcher.current.querySelector('summary')?.focus();
        return;
      }
      if (
        !e.altKey ||
        !e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.defaultPrevented ||
        (e.target as Element).closest(
          'input, select, textarea, [contenteditable="true"], dialog, [role="dialog"]',
        )
      )
        return;
      const target = e.key === 'ArrowLeft' ? previous : e.key === 'ArrowRight' ? next : undefined;
      if (target) {
        e.preventDefault();
        void navigate({
          to: `/reports/${target.id}`,
          search: (prev: Record<string, unknown>) => ({
            zeitraum: prev['zeitraum'],
            trend: prev['trend'],
            monat: prev['monat'],
          }),
        } as never);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [navigate, previous, next]);
  return (
    <nav className="report-navigation" aria-label="Weitere Berichte">
      <details className="report-switcher" ref={switcher}>
        <summary aria-label="Bericht wechseln">
          Bericht wechseln <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </summary>
        <div className="report-switcher-menu">
          <label>
            <span className="sr-only">Bericht nach Name oder Frage suchen</span>
            <input
              type="search"
              value={search}
              maxLength={160}
              autoComplete="off"
              placeholder="Name oder Frage suchen"
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ul>
            {matches.map((report) => (
              <li key={report.id}>
                <AppLink
                  to={`/reports/${report.id}`}
                  aria-current={current?.id === report.id ? 'page' : undefined}
                  search={(prev) => ({
                    zeitraum: prev['zeitraum'],
                    trend: prev['trend'],
                    monat: prev['monat'],
                  })}
                  onClick={() => {
                    if (switcher.current) switcher.current.open = false;
                    setSearch('');
                  }}
                >
                  {report.no}. {report.name}
                </AppLink>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p role="status">Kein passender Bericht.</p>}
        </div>
      </details>
      <button
        type="button"
        className="icon-btn"
        disabled={!previous}
        aria-label={previous ? `Vorheriger Bericht: ${previous.name}` : 'Vorheriger Bericht'}
        aria-keyshortcuts="Alt+Shift+ArrowLeft"
        title={previous ? `${previous.no} ${previous.name} · Alt+Umschalt+←` : 'Erster Bericht'}
        onClick={() => previous && go(previous.id)}
      >
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={!next}
        aria-label={next ? `Nächster Bericht: ${next.name}` : 'Nächster Bericht'}
        aria-keyshortcuts="Alt+Shift+ArrowRight"
        title={next ? `${next.no} ${next.name} · Alt+Umschalt+→` : 'Letzter Bericht'}
        onClick={() => next && go(next.id)}
      >
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </nav>
  );
}
