import { useEffect, useRef, type ReactNode } from 'react';
import './konten-frame.css';

/** Native disclosure with the same Escape, outside-click and focus behavior as the shell menu. */
export function KontenMenu({
  label,
  icon,
  children,
  className = '',
  iconOnly = false,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  iconOnly?: boolean;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => details.current?.removeAttribute('open');
    const key = (event: KeyboardEvent) => {
      const menu = details.current;
      const modal = document.querySelector('dialog[open]');
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        menu?.open &&
        (!modal || modal.contains(menu))
      ) {
        event.preventDefault();
        close();
        menu.querySelector('summary')?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const menu = details.current;
      const modal = document.querySelector('dialog[open]');
      if (
        menu?.open &&
        (!modal || modal.contains(menu)) &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      )
        close();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  return (
    <details className={`konten-menu ${className}`} ref={details}>
      <summary aria-label={label}>
        {icon}
        {!iconOnly && <span>{label}</span>}
      </summary>
      <div className="konten-menu-content">{children}</div>
    </details>
  );
}
