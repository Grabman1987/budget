import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

/** Is the keyboard focus somewhere the user types text? */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * `N` opens "Buchung erfassen" from anywhere (the panel with `?panel=buchung`), unless the user is
 * typing or another panel is open. Ctrl, Alt and Cmd combinations stay with the browser.
 */
export function useCaptureShortcut(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || event.repeat || isTyping(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, panel: 'buchung' })) as never,
        state: { panelOpenedInApp: true } as never,
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
