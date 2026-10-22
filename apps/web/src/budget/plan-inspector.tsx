import { Button, cx, maskMoneyText, useAmountPrivacy } from '@budget/ui';
import { ChevronDown, Info, X } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type MouseEventHandler, type ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { CategoryRow } from './api';
import { EnvelopeBody } from './envelope-panel';
import { ActivityLink } from './activity-link';
import { targetText } from './labels';
import { CLASS_TEXT, type PlanRow } from './plan-model';
import { monthLabel } from '../nav/month';
import { useStoredFlag } from '../shell/use-stored-flag';
import { QuickAssignActions } from './quick-assign-actions';
import type { PanelState } from './category-panel';
import { TargetSnooze } from './target-snooze';
import { SelectedFunding } from './selected-funding';
import { Term } from '../reports/term';

const moneyWords = (text: string) => maskMoneyText(text).replace(/ (?=€)/g, '\u00a0');

declare module '@tanstack/history' {
  interface HistoryState {
    planInspector?: { id: string; month: string };
  }
}

/** Disclosure title with the grid's chevron instead of the browser marker. */
export function FoldTitle({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: MouseEventHandler<HTMLElement> }) {
  return (
    <summary className={className} onClick={onClick}>
      <ChevronDown className="insp-chev" size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </summary>
  );
}

/** Only disclosure booleans are stored on this device, never financial values. */
function RememberedSection({ name, title, defaultOpen = false, children, id }: {
  name: string; title: string; defaultOpen?: boolean; children: ReactNode; id?: string;
}) {
  const [flag, setFlag] = useStoredFlag(`budget.plan.inspector.${name}`);
  const open = defaultOpen ? !flag : flag;
  return <details className="inspector-section" id={id} open={open}
    onToggle={(event) => {
      const next = event.currentTarget.open;
      if (next !== open) setFlag(defaultOpen ? !next : next);
    }}>
    <FoldTitle>{title}</FoldTitle>
    {children}
  </details>;
}

/** Pace stays available on hover, keyboard focus and touch without another permanent text row. */
function PaceHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inspector-pace"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <Button variant="ghost" aria-label="Pace erklären"
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
        <Info size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
      {open && <span id={id} role="tooltip" className="inspector-pace-tooltip">{moneyWords(text)}</span>}
    </span>
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
  actionRows,
  actionScopeLabel,
  inspectionIntent,
  coverCapCents,
  pace,
  sourceUnavailable,
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
  actionRows: PlanRow[];
  actionScopeLabel: string;
  inspectionIntent: number;
  coverCapCents: number | undefined;
  pace: string;
  sourceUnavailable: boolean;
}) {
  useAmountPrivacy();
  const row = selected.length === 1 ? selected[0] : undefined;
  const snoozed = row?.target?.snoozedMonths?.includes(month) ?? false;
  const targetName = row?.target?.weeklyDay != null ? 'Wochenziel' : 'Monatsziel';
  const [collapsed, setCollapsed] = useStoredFlag('budget.plan.inspector.collapsed');
  const hasSelection = selected.length > 0;
  const [fold, setFold] = useState({ intent: inspectionIntent, selected: hasSelection, open: !collapsed });
  // Only deliberate inspection opens the fold; leaving selection restores the overview preference.
  if (fold.intent !== inspectionIntent || fold.selected !== hasSelection) setFold({
    intent: inspectionIntent, selected: hasSelection,
    open: fold.intent !== inspectionIntent ? true : !hasSelection ? !collapsed : fold.open,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedIntent = useRef(inspectionIntent);
  useLayoutEffect(() => {
    if (focusedIntent.current === inspectionIntent) return;
    focusedIntent.current = inspectionIntent;
    if (!window.matchMedia('(max-width: 1179px)').matches || !heading.current) return;
    heading.current.focus({ preventScroll: true });
    heading.current.scrollIntoView({ block: 'start', behavior:
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [inspectionIntent]);
  const actions = <QuickAssignActions month={month} emptyIds={[]} selectedIds={actionRows.map((r) => r.id)}
    preview={{ rows: actionRows, tba, scopeLabel: actionScopeLabel }} />;
  const fundingIds = selected.length ? actionRows.map((row) => row.id) : [];
  const guardedFunding = <SelectedFunding key={`${month}:${fundingIds.join(':')}`} month={month} categoryIds={fundingIds} />;
  return (
    <aside className="plan-inspector card" aria-label="Plan-Inspektor">
      <details className="inspector-fold" open={fold.open}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open !== fold.open) {
            setFold({ intent: inspectionIntent, selected: hasSelection, open });
          }
        }}>
        <FoldTitle className="inspector-fold-title" onClick={(event) => {
          // Click also covers native summary keyboard activation. Programmatic toggles and
          // inspection auto-open update only local state, never the remembered overview choice.
          event.preventDefault();
          const open = !fold.open;
          setFold({ intent: inspectionIntent, selected: hasSelection, open });
          setCollapsed(!open);
        }}>
          <span>{selected.length ? 'Kategorie-Details' : 'Monatsüberblick'}<span className="insp-month"> · {monthLabel(month)}</span></span>
        </FoldTitle>
        {sourceUnavailable && <p className="panel-sub inspector-source-warning" role="alert">Die Monatsquelle ist gerade nicht verfügbar. Die bisherige Ansicht und deine Eingaben bleiben erhalten; Geldaktionen im Inspektor sind bis zum Neuladen gesperrt.</p>}
        {selected.length ? (
          <div className="inspector-selection">
            <div className="inspector-head">
              <h2 ref={heading} tabIndex={-1}>{row ? maskMoneyText(row.name) : `${selected.length} Kategorien ausgewählt`}</h2>
              <Button
                variant="ghost"
                className="inspector-close"
                aria-label="Auswahl aufheben"
                title="Auswahl aufheben (Esc)"
                onClick={onClear}
              >
                <X size={18} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
            <fieldset className="inspector-source-fields" disabled={sourceUnavailable}>
              <legend className="sr-only">Kategorie und Geldaktionen für {monthLabel(month)}</legend>
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
                  <h3 className="panel-h"><Term info>{targetName}</Term></h3>
                  <p className="panel-sub">{row.target ? moneyWords(targetText(row.target)) : 'Kein Monatsziel.'}</p>
                  {row.target && (
                    <>
                      {!snoozed && <progress
                        aria-label={`${targetName} · Fortschritt`}
                        className={cx(row.needCents <= 0 && 'is-done')}
                        max={Math.max(1, row.goalCents)}
                        value={Math.max(0, row.goalCents - row.needCents)}
                      />}
                      <p className="panel-sub">
                        {snoozed ? `${targetName} diesen Monat ausgesetzt.` : row.needCents > 0 ? `fehlt ${eur(row.needCents)}` : `${targetName} finanziert.`}
                      </p>
                      <TargetSnooze key={`${month}:${row.id}`} month={month} categoryId={row.id} snoozed={snoozed} weekly={row.target.weeklyDay != null} disabled={sourceUnavailable} />
                    </>
                  )}
                </div>
                {actions}
                {guardedFunding}
                <EnvelopeBody
                  key={`${month}:${row.id}:${row.assignedCents}`}
                  month={month}
                  row={row}
                  rows={rows}
                  tba={tba}
                  onDone={() => {}}
                  coverCapCents={coverCapCents}
                  compact
                />
                {row.due?.source === 'expected' && (
                  <p className="panel-sub">
                    erwartet {longDay(row.due.date)} · {moneyWords(row.due.name ?? '')}
                    {row.due.amountCents != null && <> · <span className="insp-amount">{eur(row.due.amountCents)}</span></>}
                  </p>
                )}
                <div className="panel-sub inspector-pace">
                  {row.cls && <span>{CLASS_TEXT[row.cls]}</span>}
                  <PaceHint key={`${month}:${row.id}`} text={pace || 'Keine Pace-Angabe.'} />
                </div>
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
                      Umbenennen / Zuweisungsziel ändern
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
                {actions}
                {guardedFunding}
              </>
            )}
            </fieldset>
          </div>
        ) : (
          <>
            <RememberedSection name="overview-closed" title="Monatsaufstellung" defaultOpen>
              {overview}
              <p className="panel-sub"><Term info>Zu verteilen</Term> · <Term info>Zugewiesen</Term></p>
            </RememberedSection>
            {actions}
            {guardedFunding}
            <RememberedSection name="split-closed" title="50/30/20" defaultOpen>
              {split}
            </RememberedSection>
            <RememberedSection id="inspector-income" name="income" title="Erwartetes Einkommen vs. Monatsziele">
              {income}
            </RememberedSection>
            <RememberedSection name="money" title="Geld auf Budget-Konten">
              {money}
            </RememberedSection>
            <RememberedSection name="waterfall" title="Wasserfall-Stufen">
              {rail}
            </RememberedSection>
          </>
        )}
      </details>
    </aside>
  );
}
