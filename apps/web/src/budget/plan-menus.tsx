import { cx } from '@budget/ui';
import { ChevronDown } from 'lucide-react';
import '../nav/disclosure-icons.css';
import type { QuickAssignMode } from '@budget/domain';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AppLink } from '../shell/app-link';
import { MONTH_SPANS, setMonthSpan, useStoredMonthSpan } from './month-span';
import { useQuickAssign } from './quick-assign-actions';
import type { PlanView } from './plan-model';

/**
 * The two Plan › Monat toolbar menus (#588): "Verteilen ▾" and "Optionen ▾". Native disclosure
 * (Enter/Space on the summary); arrows, Home/End move between the items, Esc closes and returns the
 * focus to the summary. Items that cannot be used stay focusable (`aria-disabled`) and say why.
 */
const ITEMS = 'button, a[href]';

function PlanMenu({
  label,
  title,
  className,
  children,
}: {
  label: string;
  /** Tooltip of the summary, e.g. why nothing can be distributed. */
  title?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Native listeners: the <details> is a disclosure, not an interactive widget of its own.
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const items = () => [...details.querySelectorAll<HTMLElement>(`.plan-menu-panel ${ITEMS}`)];
    const close = () => {
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const onSummary = event.target instanceof Element && event.target.closest('summary') !== null;
      if (!onSummary && !details.open) return;
      event.preventDefault();
      if (!details.open) details.open = true;
      const list = items();
      if (!list.length) return;
      const current = list.indexOf(document.activeElement as HTMLElement);
      const last = list.length - 1;
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowDown'
              ? onSummary
                ? 0
                : Math.min(current + 1, last)
              : onSummary
                ? last
                : Math.max(current - 1, 0);
      list[next]?.focus();
    };
    // An activated item closes the menu; focus goes back to the summary.
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(ITEMS) : null;
      if (target && !target.hasAttribute('aria-disabled') && details.open) close();
    };
    // Focus leaving the menu (Tab away, click elsewhere) closes it; Esc keeps returning to the summary.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (details.open && next instanceof Node && !details.contains(next)) details.open = false;
    };
    details.addEventListener('keydown', onKeyDown);
    details.addEventListener('focusout', onFocusOut);
    details.addEventListener('click', onClick);
    return () => {
      details.removeEventListener('keydown', onKeyDown);
      details.removeEventListener('focusout', onFocusOut);
      details.removeEventListener('click', onClick);
    };
  }, []);
  return (
    <details ref={ref} className={cx('plan-popover plan-menu', className)}>
      <summary title={title}>
        {label}
        <ChevronDown className="disclosure-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
      </summary>
      <div className="plan-menu-panel" role="group" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

/** A menu action; when it cannot run it stays focusable and the reason is read with it. */
function MenuAction({
  children,
  reason,
  disabled,
  pressed,
  onSelect,
}: {
  children: ReactNode;
  /** Visible reason, shown while the action is not available. */
  reason?: string | undefined;
  disabled?: boolean;
  pressed?: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  return (
    <div className="plan-menu-row">
      <button
        type="button"
        className="plan-menu-item"
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        aria-describedby={reason ? id : undefined}
        onClick={() => {
          if (!disabled) onSelect();
        }}
      >
        {children}
      </button>
      {reason && (
        <small id={id} className="plan-menu-reason">
          {reason}
        </small>
      )}
    </div>
  );
}

const SELECT_FIRST = 'Erst Kategorien in der Liste auswählen';
const QUICK: ReadonlyArray<readonly [QuickAssignMode, string]> = [
  ['last-month', 'Wie letzter Monat'],
  ['average', 'Ø 3 Monate'],
  ['target', 'Ziel'],
];

export interface CoverAction {
  /** Overspent envelopes and the cents to cover (for the description). */
  count: number;
  /** Why covering is not possible right now, if so. */
  reason: string | undefined;
  covering: boolean;
  /** Text of the source the existing cover call will use. */
  sourceLabel: string;
  onCover: () => void;
}

/**
 * "Verteilen ▾": the quick-assign calls (`quickAssign`, one undo group each), the waterfall
 * assistant and, while something is overspent, "Überzogene decken" (the existing `coverAll`).
 */
export function VerteilenMenu({
  month,
  multi,
  emptyIds,
  selectedIds,
  distributeBlock,
  onDistribute,
  cover,
}: {
  month: string;
  /** Several months side by side: the quick-assign calls act on one month only. */
  multi: boolean;
  emptyIds: string[];
  selectedIds: string[];
  /** Why the waterfall assistant cannot start, if so ("Nichts zu verteilen" …). */
  distributeBlock: string | null;
  onDistribute: () => void;
  cover: CoverAction | null;
}) {
  const quick = useQuickAssign(month);
  const single = 'Nur bei einem Monat';
  return (
    <PlanMenu
      label="Verteilen"
      className="plan-menu-verteilen"
      title={distributeBlock ?? undefined}
    >
      <MenuAction
        disabled={quick.busy || multi || !emptyIds.length}
        reason={
          multi ? single : !emptyIds.length ? 'Keine leere Kategorie mit Vorschlag' : undefined
        }
        onSelect={() => void quick.apply('empty', emptyIds)}
      >
        Leere füllen
      </MenuAction>
      {QUICK.map(([mode, text]) => (
        <MenuAction
          key={mode}
          disabled={quick.busy || multi || !selectedIds.length}
          reason={multi ? single : !selectedIds.length ? SELECT_FIRST : undefined}
          onSelect={() => void quick.apply(mode, selectedIds)}
        >
          {text}
        </MenuAction>
      ))}
      <MenuAction
        disabled={Boolean(distributeBlock)}
        reason={distributeBlock ?? undefined}
        onSelect={onDistribute}
      >
        Wasserfall-Assistent
      </MenuAction>
      {cover && (
        <>
          <hr className="plan-menu-sep" />
          <MenuAction
            disabled={cover.covering || Boolean(cover.reason)}
            reason={cover.reason ?? `${cover.count} überzogen · aus ${cover.sourceLabel}`}
            onSelect={cover.onCover}
          >
            Überzogene decken
          </MenuAction>
        </>
      )}
    </PlanMenu>
  );
}

const VIEWS: ReadonlyArray<{ value: PlanView; label: string }> = [
  { value: 'group', label: 'Gruppen' },
  { value: 'stage', label: 'Wasserfall' },
  { value: 'time', label: 'Zeit' },
  { value: 'class', label: 'Klassen' },
];

/** "Optionen ▾": Ansicht (default "Gruppen"), Monate 1/2/3, collapse all, Monatsabschluss. */
export function OptionenMenu({
  month,
  view,
  multi,
  phone,
  collapsed,
  selectionMode = false,
  onSelectionMode,
  onView,
  onToggleAll,
}: {
  month: string;
  view: PlanView;
  /** Several months side by side always show "Gruppen". */
  multi: boolean;
  phone: boolean;
  collapsed: boolean;
  selectionMode?: boolean;
  onSelectionMode?: () => void;
  onView: (view: PlanView) => void;
  onToggleAll: () => void;
}) {
  const span = useStoredMonthSpan();
  return (
    <PlanMenu label="Optionen" className="plan-menu-optionen">
      {phone && onSelectionMode && (
        <MenuAction pressed={selectionMode} onSelect={onSelectionMode}>
          {selectionMode ? 'Auswahl beenden' : 'Auswählen'}
        </MenuAction>
      )}
      <div role="group" aria-label="Ansicht" className="plan-menu-group">
        <span className="plan-menu-heading" aria-hidden="true">
          Ansicht
        </span>
        {VIEWS.map((v) => (
          <MenuAction
            key={v.value}
            disabled={multi}
            pressed={view === v.value}
            onSelect={() => onView(v.value)}
          >
            {v.label}
          </MenuAction>
        ))}
      </div>
      {!phone && (
        <div role="group" aria-label="Anzahl Monate" className="plan-menu-group">
          <span className="plan-menu-heading" aria-hidden="true">
            Monate
          </span>
          {MONTH_SPANS.map((n) => (
            <MenuAction key={n} pressed={span === n} onSelect={() => setMonthSpan(n)}>
              {n === 1 ? '1 Monat' : `${n} Monate`}
            </MenuAction>
          ))}
        </div>
      )}
      <div className="plan-menu-group">
        <MenuAction onSelect={onToggleAll}>
          {collapsed ? 'Alle ausklappen' : 'Alle einklappen'}
        </MenuAction>
        <AppLink className="plan-menu-item" to={`/monatsabschluss/${month}`} search={{}}>
          Monatsabschluss starten oder fortsetzen
        </AppLink>
      </div>
    </PlanMenu>
  );
}
