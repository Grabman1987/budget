import { Button, cx, useAmountPrivacy } from '@budget/ui';
import { ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { CategoryRow } from './api';
import { EnvelopeBody } from './envelope-panel';
import { ActivityLink } from './activity-link';
import { targetText } from './labels';
import { barFor, CLASS_TEXT, type PlanRow } from './plan-model';
import { todayInVienna } from '@budget/domain';
import { PlanAutomatic } from './plan-automatic';
import type { PanelState } from './category-panel';
import { MonthOverviewInspector } from './plan-overview';

declare module '@tanstack/history' {
  interface HistoryState {
    planInspector?: { id: string; month: string };
  }
}

/** Disclosure title with the grid's chevron instead of the browser marker. */
export function FoldTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <summary className={className}>
      <ChevronDown className="insp-chev" size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </summary>
  );
}

/** Reuses the existing month figures and audited money forms; mobile stays in document flow. */
export function PlanInspector({
  month,
  rows,
  selected,
  tba,
  category,
  onCategory,
  onHide,
  onClear,
  overview,
  next,
  split,
  income,
  money,
  rail,
  visibleRows,
  multi = false,
  focusSelection = true,
}: {
  month: string;
  rows: PlanRow[];
  selected: PlanRow[];
  tba: number;
  category: CategoryRow | undefined;
  onCategory: (state: PanelState) => void;
  onHide: (category: CategoryRow) => void;
  onClear: () => void;
  overview: ReactNode;
  next?: ReactNode;
  split: ReactNode;
  income: ReactNode;
  money: ReactNode;
  rail: ReactNode;
  visibleRows: PlanRow[];
  multi?: boolean;
  focusSelection?: boolean;
}) {
  useAmountPrivacy();
  const heading = useRef<HTMLHeadingElement>(null);
  const selectionKey = selected.map((r) => r.id).join(':');
  useEffect(() => {
    if (!focusSelection || !selectionKey || !window.matchMedia('(max-width: 1179px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [selectionKey, focusSelection]);
  const automatic = <PlanAutomatic month={month} rows={selected.length ? selected : visibleRows} tba={tba} disabled={multi} />;
  if (selected.length === 0)
    return (
      <MonthOverviewInspector
        month={month}
        overview={overview}
        next={next}
        split={split}
        income={income}
        money={money}
        rail={rail}
        automatic={automatic}
      />
    );
  const row = selected.length === 1 ? selected[0] : undefined;
  const pace = row ? barFor(row, { month, today: todayInVienna(), cardName: () => 'Kreditkarte' }) : undefined;
  return (
    <aside className="plan-inspector card" aria-label="Plan-Inspektor">
      <details className="inspector-fold" open key={selected.map((r) => r.id).join(':')}>
        <FoldTitle className="inspector-fold-title">
          {row ? 'Kategorie-Details' : 'Auswahl'}
        </FoldTitle>
        <div className="inspector-selection">
          <div className="inspector-head">
            <h2 ref={heading} tabIndex={-1}>{row?.name ?? `${selected.length} Kategorien ausgewählt`}</h2>
            <Button
              variant="ghost"
              className="inspector-close"
              aria-label="Auswahl aufheben"
              title="Auswahl aufheben (Esc)"
              onClick={onClear}
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
          {row ? (
            <>
              <div className="inspector-activity">
                <span>Aktivität</span>
                <ActivityLink month={month} id={row.id} name={row.name} cents={row.activityCents} />
              </div>
              <div className="inspector-target">
                <h3 className="panel-h">Ziel</h3>
                <p className="panel-sub">{row.target ? targetText(row.target) : 'Kein Ziel.'}</p>
                {row.target && (
                  <>
                    <progress
                      aria-label="Zielfortschritt"
                      className={cx(row.needCents <= 0 && 'is-done')}
                      max={Math.max(1, row.goalCents)}
                      value={Math.max(0, row.goalCents - row.needCents)}
                    />
                    <p className="panel-sub">
                      {row.needCents > 0 ? <>fehlt <span className="plan-money">{eur(row.needCents)}</span></> : 'Ziel finanziert.'}
                    </p>
                  </>
                )}
              </div>
              <h3 className="panel-h">Automatisch zuweisen</h3>
              {automatic}
              <EnvelopeBody
                key={`${month}:${row.id}:${row.assignedCents}`}
                month={month}
                row={row}
                rows={rows}
                tba={tba}
                onDone={() => {}}
                compact
              />
              {row.due?.source === 'expected' && (
                <p className="panel-sub">
                  erwartet {longDay(row.due.date)} · {row.due.name}
                  {row.due.amountCents != null && <> · <span className="plan-money">{eur(row.due.amountCents)}</span></>}
                </p>
              )}
              <p className="panel-sub inspector-pace">
                {row.cls && CLASS_TEXT[row.cls]}
                {pace?.meta && ` · Tempo: ${pace.meta}`}
              </p>
              <AppLink
                to={`/plan/monat/envelope/${encodeURIComponent(row.id)}`}
                search={{ monat: month }}
                state={{ planDetailOpenedInApp: true }}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  // Preserve the source entry's height and selection for scroll restoration.
                  window.history.replaceState(
                    { ...window.history.state, planInspector: { id: row.id, month } },
                    '',
                  );
                }}
              >
                Verlauf und Buchungen
              </AppLink>
              <details className="inspector-section">
                <FoldTitle>Kategorie-Aktionen</FoldTitle>
                <div className="inspector-menu">
                  <Button
                    variant="ghost"
                    disabled={!category}
                    onClick={() =>
                      category && onCategory({ mode: 'edit', category, groupId: category.groupId })
                    }
                  >
                    Umbenennen / Ziel ändern
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!category}
                    onClick={() => category && onHide(category)}
                  >
                    {category?.hiddenAt ? 'Einblenden' : 'Ausblenden'}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!category || category.kind === 'card_payment'}
                    onClick={() => category && onCategory({ mode: 'merge', category })}
                  >
                    Zusammenführen …
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!category || category.splitCount === 0}
                    onClick={() => category && onCategory({ mode: 'split', category })}
                  >
                    Abspalten …
                  </Button>
                </div>
              </details>
            </>
          ) : (
            <>
              <dl className="insp-list">
                {(['assignedCents', 'activityCents', 'availableCents'] as const).map((key, i) => (
                  <div key={key}>
                    <dt>{['Zugewiesen', 'Aktivität', 'Verfügbar'][i]}</dt>
                    <dd>{eur(selected.reduce((sum, r) => sum + r[key], 0))}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="panel-h">Automatisch zuweisen</h3>
              {automatic}
            </>
          )}
        </div>
      </details>
    </aside>
  );
}
