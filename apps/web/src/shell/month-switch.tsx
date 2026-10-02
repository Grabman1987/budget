import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { currentMonth, useMonth } from './use-month';

/** Keys that must keep working inside editable or composite controls. */
const OWN_KEYS = 'input, textarea, select, [contenteditable="true"], [role="slider"], [role="tab"]';

/**
 * Left and right arrow move the month by one, as the buttons do. Only while nothing else wants
 * the arrow keys: focus on the page itself or on the month switch, no modifier, no open dialog.
 */
function useMonthKeys(shift: (delta: number) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OWN_KEYS)) return;
      const idle = !target || target === document.body || target.closest('.month-switch');
      if (!idle || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'))
        return;
      event.preventDefault();
      shift(event.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}

/**
 * Month switch of Heute and Plan in the title cell: previous, month, next (the same markup on both
 * pages), arrow keys, and a way back to the current month once the view moved away from it.
 * `heading` replaces the month name (several months show their range).
 */
export function MonthSwitch({ heading }: { heading: ReactNode }) {
  const [month, shift, setMonth] = useMonth();
  useMonthKeys(shift);
  const current = currentMonth();
  return (
    <div className="month-switch">
      <button type="button" className="icon-btn" aria-label="Vormonat" onClick={() => shift(-1)}>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <h1>{heading}</h1>
      <button
        type="button"
        className="icon-btn"
        aria-label="Nächster Monat"
        onClick={() => shift(1)}
      >
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {month !== current && (
        <button
          type="button"
          className="icon-btn month-now"
          aria-label="Zum aktuellen Monat"
          title="Zum aktuellen Monat"
          onClick={() => setMonth(current)}
        >
          <CalendarCheck size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
