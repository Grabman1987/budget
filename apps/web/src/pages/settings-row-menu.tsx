import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Native disclosure keeps all row actions keyboard reachable and returns focus on Escape. */
export function SettingsRowMenu({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const menu = ref.current;
      if (
        !document.querySelector('dialog[open]') &&
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      )
        menu.open = false;
    };
    const keydown = (event: KeyboardEvent) => {
      const menu = ref.current;
      if (event.key === 'Escape' && menu?.contains(document.activeElement)) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', keydown);
    };
  }, []);
  return (
    <details ref={ref} className="settings-row-menu">
      <summary aria-label={`Aktionen für ${name}`}>
        <Ellipsis size={18} aria-hidden="true" />
      </summary>
      <div className="settings-row-menu-items">{children}</div>
    </details>
  );
}
