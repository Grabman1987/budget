import { cx } from '@budget/ui';
import { Check, ChevronDown, Ellipsis } from 'lucide-react';
import type { QuickAssignMode } from '@budget/domain';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AppLink } from '../shell/app-link';
import { MONTH_SPANS, setMonthSpan, useStoredMonthSpan } from './month-span';
import { useQuickAssign } from './quick-assign-actions';
import type { PlanView } from './plan-model';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { setPlanDensity, usePlanDensity } from './plan-density';

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
  iconOnly = false,
  chipText,
  chipDetail,
  dock = false,
  children,
}: {
  label: string;
  /** Tooltip of the summary, e.g. why nothing can be distributed. */
  title?: string | undefined;
  className?: string;
  iconOnly?: boolean;
  /**
   * Phone chip (#1007): short visible text; the accessible name stays `label`. With `iconOnly` it
   * replaces the icon, otherwise it replaces the visible label.
   */
  chipText?: string | undefined;
  /** Active filter shown after the chip text; truncated before the chip squeezes the search. */
  chipDetail?: string | undefined;
  /** Fixed bottom action (phone): the panel opens upwards over the whole list area. */
  dock?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Native listeners: the <details> is a disclosure, not an interactive widget of its own.
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    let pointerActive = false;
    const pointerDown = () => {
      pointerActive = REDESIGN_ENABLED && window.innerWidth < 768;
    };
    const pointerUp = () => {
      pointerActive = false;
    };
    const pointerCancel = () => {
      const wasActive = pointerActive;
      pointerActive = false;
      // A cancelled touch can be a menu pan. Keep it open, with a keyboard focus target.
      const active = document.activeElement;
      if (wasActive && details.open && active?.contains(details))
        details.querySelector('summary')?.focus({ preventScroll: true });
    };
    const panel = details.querySelector<HTMLElement>('.plan-menu-panel');
    const head = details.closest('.plan-grid')?.querySelector<HTMLElement>('.plan-topbar-v2');
    const positionPanel = () => {
      if (!REDESIGN_ENABLED || !details.open || window.innerWidth >= 768) {
        panel?.style.removeProperty('--plan-action-menu-top');
        return;
      }
      const summary = details.querySelector('summary');
      if (!panel || !summary) return;
      const rootStyle = getComputedStyle(document.documentElement);
      const bottom = window.innerHeight - (Number.parseFloat(rootStyle.scrollPaddingBottom) || 154);
      const panelStyle = getComputedStyle(panel);
      const minimumHeight =
        44 +
        Number.parseFloat(panelStyle.paddingTop) +
        Number.parseFloat(panelStyle.paddingBottom) +
        Number.parseFloat(panelStyle.borderTopWidth) +
        Number.parseFloat(panelStyle.borderBottomWidth);
      const top = Math.max(
        Number.parseFloat(rootStyle.scrollPaddingTop) || 176,
        (head?.getBoundingClientRect().bottom ?? 0) + 8,
        dock ? 0 : summary.getBoundingClientRect().bottom + 4,
      );
      panel.style.setProperty(
        '--plan-action-menu-top',
        `${Math.max(8, Math.min(top, bottom - minimumHeight))}px`,
      );
    };
    const observer =
      REDESIGN_ENABLED && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(positionPanel)
        : null;
    if (head) observer?.observe(head);
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
      // WebKit focuses the containing sheet on touch-down before the menu item's click.
      if (pointerActive && next instanceof Element && next.contains(details)) return;
      if (details.open && next instanceof Node && !details.contains(next)) details.open = false;
    };
    details.addEventListener('keydown', onKeyDown);
    details.addEventListener('focusout', onFocusOut);
    details.addEventListener('click', onClick);
    details.addEventListener('toggle', positionPanel);
    details.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointerup', pointerUp, true);
    window.addEventListener('pointercancel', pointerCancel, true);
    window.addEventListener('scroll', positionPanel, { passive: true });
    window.addEventListener('resize', positionPanel);
    return () => {
      details.removeEventListener('keydown', onKeyDown);
      details.removeEventListener('focusout', onFocusOut);
      details.removeEventListener('click', onClick);
      details.removeEventListener('toggle', positionPanel);
      details.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerUp, true);
      window.removeEventListener('pointercancel', pointerCancel, true);
      pointerActive = false;
      window.removeEventListener('scroll', positionPanel);
      window.removeEventListener('resize', positionPanel);
      observer?.disconnect();
      panel?.style.removeProperty('--plan-action-menu-top');
    };
  }, [dock]);
  return (
    <details ref={ref} className={cx('plan-popover plan-menu', className)}>
      <summary
        role={REDESIGN_ENABLED ? 'button' : undefined}
        title={title ?? (iconOnly ? label : undefined)}
        aria-label={
          chipText && iconOnly
            ? chipDetail
              ? `${chipText}, ${chipDetail}`
              : chipText
            : iconOnly || chipText
              ? label
              : undefined
        }
      >
        {iconOnly ? (
          <>
            <span className="sr-only" aria-hidden={chipText ? true : undefined}>
              {label}
            </span>
            {chipText ? (
              <>
                <span aria-hidden="true">{chipText}</span>
                {chipDetail && (
                  <span className="plan-chip-detail" aria-hidden="true">
                    · {chipDetail}
                  </span>
                )}
                <ChevronDown
                  className="disclosure-chevron"
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </>
            ) : (
              <Ellipsis size={20} strokeWidth={1.5} aria-hidden="true" />
            )}
          </>
        ) : (
          <>
            {chipText ?? label}
            <ChevronDown
              className="disclosure-chevron"
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </>
        )}
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
        {pressed && (
          <Check className="plan-menu-selected" size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
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
  onFillTargets,
  cover,
  dock = false,
}: {
  month: string;
  /** Several months side by side: the quick-assign calls act on one month only. */
  multi: boolean;
  emptyIds: string[];
  selectedIds: string[];
  /** Why the waterfall assistant cannot start, if so ("Nichts zu verteilen" …). */
  distributeBlock: string | null;
  onDistribute: () => void;
  onFillTargets: () => void;
  cover: CoverAction | null;
  /** Phone (#1007): the menu is the fixed bottom "Verteilen" button. */
  dock?: boolean;
}) {
  const quick = useQuickAssign(month);
  const single = 'Nur bei einem Monat';
  return (
    <PlanMenu
      label={REDESIGN_ENABLED ? 'Geld verteilen' : 'Verteilen'}
      className={cx('plan-menu-verteilen', dock && 'plan-menu-dock')}
      chipText={dock ? 'Verteilen' : undefined}
      dock={dock}
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
      <MenuAction disabled={multi} reason={multi ? single : undefined} onSelect={onFillTargets}>
        Alle Ziele füllen
      </MenuAction>
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
  readUtilities,
  filters,
  hiddenControl,
  chipText,
  chipDetail,
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
  /** Optional same-month read controls; no assignment actions or nested menu summaries. */
  readUtilities?: ReactNode;
  filters?: ReactNode;
  hiddenControl?: { shown: boolean; toggle: () => void } | undefined;
  /** Phone (#1007): visible "Ansicht" chip instead of the three-dot icon. */
  chipText?: string | undefined;
  chipDetail?: string | undefined;
}) {
  const span = useStoredMonthSpan();
  const density = usePlanDensity();
  return (
    <PlanMenu
      label="Optionen"
      className="plan-menu-optionen"
      iconOnly={REDESIGN_ENABLED}
      {...(chipText ? { chipText } : {})}
      {...(chipDetail ? { chipDetail } : {})}
    >
      {REDESIGN_ENABLED && (
        <div role="group" aria-label="Dichte" className="plan-menu-group">
          <span className="plan-menu-heading" aria-hidden="true">
            Dichte
          </span>
          {(
            [
              ['all', 'Alle'],
              ['compact', 'Kompakt'],
              ['minimal', 'Minimal'],
            ] as const
          ).map(([value, label]) => (
            <MenuAction
              key={value}
              pressed={density === value}
              onSelect={() => setPlanDensity(value)}
            >
              {label}
            </MenuAction>
          ))}
        </div>
      )}
      {filters}
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
      {!phone && !REDESIGN_ENABLED && (
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
        {hiddenControl && (
          <MenuAction pressed={hiddenControl.shown} onSelect={hiddenControl.toggle}>
            Ausgeblendete zeigen
          </MenuAction>
        )}
        <MenuAction onSelect={onToggleAll}>
          {collapsed ? 'Alle ausklappen' : 'Alle einklappen'}
        </MenuAction>
        <AppLink className="plan-menu-item" to={`/monatsabschluss/${month}`} search={{}}>
          Monatsabschluss starten oder fortsetzen
        </AppLink>
      </div>
      {readUtilities}
    </PlanMenu>
  );
}
