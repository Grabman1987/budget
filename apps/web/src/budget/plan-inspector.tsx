import { Button, cx, useAmountPrivacy } from '@budget/ui';
import { ChevronDown, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { CategoryRow } from './api';
import { EnvelopeBody } from './envelope-panel';
import { ActivityLink } from './activity-link';
import { targetText } from './labels';
import type { PlanRow } from './plan-model';
import { QuickAssignActions } from './quick-assign-actions';
import type { PanelState } from './category-panel';

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
  split,
  income,
  money,
  rail,
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
  split: ReactNode;
  income: ReactNode;
  money: ReactNode;
  rail: ReactNode;
}) {
  useAmountPrivacy();
  const row = selected.length === 1 ? selected[0] : undefined;
  return (
    <aside className="plan-inspector card" aria-label="Plan-Inspektor">
      <details className="inspector-fold" open key={selected.map((r) => r.id).join(':')}>
        <FoldTitle className="inspector-fold-title">
          {row ? 'Kategorie-Details' : selected.length ? 'Auswahl' : 'Monatszahlen'}
        </FoldTitle>
        {selected.length ? (
          <div className="inspector-selection">
            <div className="inspector-head">
              <h2>{row?.name ?? `${selected.length} Kategorien ausgewählt`}</h2>
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
                  <ActivityLink
                    month={month}
                    id={row.id}
                    name={row.name}
                    cents={row.activityCents}
                  />
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
                        {row.needCents > 0 ? `fehlt ${eur(row.needCents)}` : 'Ziel finanziert.'}
                      </p>
                    </>
                  )}
                </div>
                <EnvelopeBody
                  key={`${month}:${row.id}:${row.assignedCents}`}
                  month={month}
                  row={row}
                  rows={rows}
                  tba={tba}
                  onDone={() => {}}
                  quickValues
                  compact
                />
                {row.due?.source === 'expected' && (
                  <p className="panel-sub">
                    erwartet {longDay(row.due.date)} · {row.due.name}
                    {row.due.amountCents != null && ` · ${eur(row.due.amountCents)}`}
                  </p>
                )}
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
                        category &&
                        onCategory({ mode: 'edit', category, groupId: category.groupId })
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
                <QuickAssignActions
                  month={month}
                  emptyIds={[]}
                  selectedIds={selected.map((r) => r.id)}
                  inline
                />
              </>
            )}
          </div>
        ) : (
          <>
            <details className="inspector-section" open>
              <FoldTitle>Monatsüberblick</FoldTitle>
              {overview}
            </details>
            <details className="inspector-section">
              <FoldTitle>50/30/20</FoldTitle>
              {split}
            </details>
            <details className="inspector-section" id="inspector-income">
              <FoldTitle>Erwartetes Einkommen vs. Monatsziele</FoldTitle>
              {income}
            </details>
            {money}
            <details className="inspector-section">
              <FoldTitle>Wasserfall-Stufen</FoldTitle>
              {rail}
            </details>
          </>
        )}
      </details>
    </aside>
  );
}
