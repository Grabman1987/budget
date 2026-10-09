import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { REPORTS } from '../nav/reports-catalog';
import './report-navigation.css';

export function adjacentReports(id: string) {
  const index = REPORTS.findIndex((r) => r.id === id);
  return {
    previous: index > 0 ? REPORTS[index - 1] : undefined,
    next: index >= 0 ? REPORTS[index + 1] : undefined,
  };
}

/** Catalog order also crosses group boundaries. Alt+Shift avoids browser history shortcuts. */
export function ReportNavigation({ id }: { id: string }) {
  const navigate = useNavigate();
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
      <button
        type="button"
        className="icon-btn"
        disabled={!previous}
        aria-label={previous ? `Vorheriger Bericht: ${previous.name}` : 'Vorheriger Bericht'}
        aria-keyshortcuts="Alt+Shift+ArrowLeft"
        title={previous ? `${previous.pos} ${previous.name} · Alt+Umschalt+←` : 'Erster Bericht'}
        onClick={() => previous && go(previous.id)}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-btn"
        disabled={!next}
        aria-label={next ? `Nächster Bericht: ${next.name}` : 'Nächster Bericht'}
        aria-keyshortcuts="Alt+Shift+ArrowRight"
        title={next ? `${next.pos} ${next.name} · Alt+Umschalt+→` : 'Letzter Bericht'}
        onClick={() => next && go(next.id)}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
