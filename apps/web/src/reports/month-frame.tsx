import { Button } from '@budget/ui';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { longDay } from '../ledger/format';
import { monthLabel, monthOf, shiftMonth } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import { PageFrame } from '../pages/placeholder-page';
import { useMonth } from '../shell/use-month';
import './month-report.css';
import type { VerdictFacts } from '@budget/domain';

/** Per page, not per report: `/reports/gehalt` and `/reports/gehalt/historie` have their own sections. */
const sectionsKey = () => `budget.report-sections.${location.pathname}`;

const NO_COLLAPSED_SECTIONS: readonly string[] = [];

function collapsedSections(initial: readonly string[] = NO_COLLAPSED_SECTIONS): Set<string> {
  try {
    const raw = localStorage.getItem(sectionsKey());
    if (raw === null) return new Set(initial);
    const stored: unknown = JSON.parse(raw);
    return new Set(Array.isArray(stored) ? stored.filter((k) => typeof k === 'string') : initial);
  } catch {
    return new Set(initial); // Existing callers keep their expanded default.
  }
}

/**
 * Adds a disclosure button to every top-level `<section>` of the report body that has a heading
 * (a direct child, or a child of a direct child such as `.tbd-head`), and remembers the collapsed
 * ones per page in localStorage. The reports render their sections themselves, so the frame
 * enhances the DOM it owns (and again when a section is rendered later, e.g. after loading).
 * Collapsing hides everything but the marked head by stylesheet.
 * A section is keyed by its heading id, else by its position (ponytail: shifts if sections come and go).
 */
export function useCollapsibleSections(slug: string, initial: readonly string[] = NO_COLLAPSED_SECTIONS) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const enhance = () => {
      let index = -1;
      for (const section of root.querySelectorAll('section')) {
        if (section.parentElement?.closest('section')) continue;
        const heading = section.querySelector(':scope > :is(h2, h3), :scope > * > :is(h2, h3)');
        if (!heading) continue;
        index += 1;
        if (section.querySelector(':scope > .section-toggle, :scope > * > .section-toggle'))
          continue;
        const bare = heading.parentElement === section;
        const head = bare ? heading : heading.parentElement!;
        head.setAttribute('data-section-head', '');
        const key = heading.id || `#${index}`;
        heading.id ||= `${slug}-section-${index}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `icon-btn section-toggle${bare ? ' section-toggle-bare' : ''}`;
        // The name is the generic action followed by the section title, so voice control and
        // screen readers can tell the toggles apart (#647). Visible text is unchanged (icon only).
        button.id = `${heading.id}-toggle`;
        button.setAttribute('aria-label', 'Abschnitt ein- oder ausklappen');
        button.setAttribute('aria-labelledby', `${button.id} ${heading.id}`);
        button.setAttribute('aria-describedby', heading.id); // kept from #640 (duplicate announcement accepted)
        const show = (open: boolean) => {
          button.setAttribute('aria-expanded', String(open));
          if (open) section.removeAttribute('data-collapsed');
          else section.setAttribute('data-collapsed', 'true');
        };
        show(!collapsedSections(initial).has(key));
        button.addEventListener('click', () => {
          const open = button.getAttribute('aria-expanded') !== 'true';
          show(open);
          const collapsed = collapsedSections(initial); // re-read: other instances may have written
          if (open) collapsed.delete(key);
          else collapsed.add(key);
          try {
            localStorage.setItem(sectionsKey(), JSON.stringify([...collapsed]));
          } catch {
            // no storage: the choice holds until the page is left
          }
        });
        if (bare) heading.after(button);
        else head.append(button);
      }
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [slug, initial]);
  return ref;
}

/** Selected month of a report (`?monat=`), the current month by default. */
export function useReportMonth() {
  const [month, shift] = useMonth();
  return { month, shift, current: monthOf(new Date()) };
}

const SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
/** `2023-10` as "Okt 2023". */
export const shortMonth = (month: string) =>
  `${SHORT[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

/** "September 2026", with "bis 17.09." while the month is running. */
export function monthTitle(month: string, partial: boolean, asOf?: string): string {
  return partial && asOf ? `${monthLabel(month)} · bis ${asOf.slice(8, 10)}.` : monthLabel(month);
}

/** Steuerung "Monat": previous and next month around the label; no month after the current one. */
export function MonthControl({
  month,
  shift,
  current,
  firstMonth,
}: {
  month: string;
  shift: (delta: number) => void;
  current: string;
  /** First month with records, when known: nothing to see before it. */
  firstMonth?: string | undefined;
}) {
  return (
    <div className="mr-month" role="group" aria-label="Monat">
      <button
        type="button"
        className="icon-btn"
        aria-label="Vormonat"
        disabled={firstMonth !== undefined && shiftMonth(month, -1) < firstMonth}
        onClick={() => shift(-1)}
      >
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="mr-month-label" data-testid="report-month">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Nächster Monat"
        disabled={month >= current}
        onClick={() => shift(1)}
      >
        <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="ghost" size="sm" className="mr-print" onClick={() => window.print()}>
      <Printer className="icon icon-sm" size={16} strokeWidth={1.75} aria-hidden="true" />
      Drucken
    </Button>
  );
}

/**
 * Title block and registers of a report of the group "Monat und Einkommen": Steuerung "Monat"
 * (and "Drucken" on a print sheet), the data basis and the report body.
 */
export function MonthReportFrame({
  report,
  meta,
  month,
  shift,
  current,
  firstMonth,
  asOf,
  basis,
  print = false,
  extraFields = [],
  initialCollapsed,
  children,
  verdict,
}: {
  report: ReportEntry;
  verdict?: VerdictFacts | undefined;
  meta: PageMeta;
  month: string;
  shift: (delta: number) => void;
  current: string;
  firstMonth?: string | undefined;
  /** The day the data is as of, once loaded. */
  asOf?: string | undefined;
  /** Replaces the data basis text (loading, unavailable). */
  basis?: ReactNode;
  print?: boolean;
  extraFields?: Array<{ label: string; value: ReactNode }>;
  initialCollapsed?: readonly string[];
  children: ReactNode;
}) {
  const sectionsRef = useCollapsibleSections(report.id, initialCollapsed);
  return (
    <PageFrame
      verdict={verdict}
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        basis ??
        (asOf && firstMonth ? `${shortMonth(firstMonth)} bis ${longDay(asOf)}` : 'wird geladen')
      }
      extraFields={[
        {
          label: 'Monat',
          value: (
            <MonthControl month={month} shift={shift} current={current} firstMonth={firstMonth} />
          ),
        },
        ...extraFields,
        ...(print ? [{ label: 'Blatt', value: <PrintButton /> }] : []),
      ]}
    >
      <div ref={sectionsRef} className="rs-scope">
        {children}
      </div>
    </PageFrame>
  );
}
