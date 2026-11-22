import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppLink } from '../shell/app-link';
import { HUB_REPORTS, hubReport, matchingHubReports } from './report-hub-model';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { isPaperPresentation } from './report-search';
import './report-navigation.css';

const periodViews: Record<string, readonly { value: string; label: string }[]> = {
  onepager: [
    { value: 'finanzcheck', label: 'Finanz-Check-Verlauf' },
    { value: 'druckblatt', label: 'A4 Druckblatt · Monat' },
  ],
  jahresreport: [{ value: 'druckblatt', label: 'A4 Druckblatt · Jahr' }],
  'einnahmen-ausgaben': [{ value: 'projekte', label: 'Projekte und Nebeneinkünfte' }],
  ausgaben: [
    { value: 'kategorien', label: 'Kategorien und Verlauf' },
    { value: 'empfaenger', label: 'Empfänger' },
  ],
  'vermoegen-schulden': [
    { value: 'verlauf', label: 'Vermögensverlauf' },
    { value: 'gesamt', label: 'Gesamtübersicht' },
  ],
  psteuern: [
    { value: 'gesamt', label: 'Kosten gesamt' },
    { value: 'bankkosten', label: 'Bank- und Zinskosten' },
    { value: 'ertraege', label: 'Erträge' },
    { value: 'kostenverlauf', label: 'Kosten im Verlauf' },
  ],
  pallocation: [
    { value: 'einzahlungen', label: 'Einzahlungen und Wert' },
    { value: 'rendite', label: 'Rendite & Risiko' },
    { value: 'kennzahlen', label: 'Kennzahlen' },
    { value: 'klassen', label: 'Anlageklassen im Verlauf' },
  ],
};
const SUB_REPORT_PARENTS = Object.keys(periodViews);

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
  const presentation = useSearch({ strict: false }) as { darstellung?: string };
  const location = useLocation();
  const [search, setSearch] = useState('');
  const switcher = useRef<HTMLDetailsElement>(null);
  const query = search.trim().toLocaleLowerCase('de-AT');
  const parents = matchingHubReports(search);
  const matches = HUB_REPORTS.filter(
    (report) =>
      parents.includes(report) ||
      (REDESIGN_ENABLED &&
        periodViews[report.id]?.some((view) =>
          view.label.toLocaleLowerCase('de-AT').includes(query),
        )),
  );
  const current = hubReport(id);
  const { previous, next } = adjacentReports(id);
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
  const go = (reportId: string) =>
    void navigate({
      to: `/reports/${reportId}`,
      search: (prev: Record<string, unknown>) => ({
        zeitraum: prev['zeitraum'],
        trend: prev['trend'],
        monat: prev['monat'],
      }),
    } as never);
  return (
    <nav className="report-navigation" aria-label="Weitere Berichte">
      <details className="report-switcher" ref={switcher}>
        <summary aria-label="Bericht wechseln">
          <span className="report-switcher-label">Bericht wechseln</span>{' '}
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
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
                  aria-current={
                    current?.id === report.id &&
                    !(
                      REDESIGN_ENABLED &&
                      periodViews[report.id]?.some((view) =>
                        view.value === 'druckblatt'
                          ? isPaperPresentation(presentation.darstellung, location.hash)
                          : presentation.darstellung === view.value,
                      )
                    )
                      ? 'page'
                      : undefined
                  }
                  search={(prev) => ({
                    ...(REDESIGN_ENABLED && current?.id === report.id && periodViews[report.id]
                      ? prev
                      : {}),
                    zeitraum: prev['zeitraum'],
                    trend: prev['trend'],
                    monat: prev['monat'],
                    darstellung: undefined,
                  })}
                  hash=""
                  onClick={() => {
                    if (switcher.current) switcher.current.open = false;
                    setSearch('');
                  }}
                >
                  {report.no}. {report.name}
                </AppLink>
                {REDESIGN_ENABLED && SUB_REPORT_PARENTS.includes(report.id) && (
                  <ul
                    className="report-switcher-children"
                    aria-label={`Unterberichte von ${report.name}`}
                  >
                    {periodViews[report.id]?.map((view) => (
                      <li key={view.value}>
                        <AppLink
                          to={`/reports/${report.id}`}
                          search={(prev) => ({
                            ...(current?.id === report.id ? prev : {}),
                            zeitraum: prev['zeitraum'],
                            trend: prev['trend'],
                            monat: prev['monat'],
                            period: prev['period'],
                            darstellung: view.value,
                          })}
                          hash=""
                          aria-current={
                            current?.id === report.id &&
                            (view.value === 'druckblatt'
                              ? isPaperPresentation(presentation.darstellung, location.hash)
                              : presentation.darstellung === view.value)
                              ? 'page'
                              : undefined
                          }
                          onClick={() => {
                            if (switcher.current) switcher.current.open = false;
                            setSearch('');
                          }}
                        >
                          {view.label}
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p role="status">Kein passender Bericht.</p>}
        </div>
      </details>
      {!REDESIGN_ENABLED && (
        <>
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
        </>
      )}
    </nav>
  );
}
