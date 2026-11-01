import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AppLink } from '../shell/app-link';
import type { AreaDef } from './areas';
import { isMonth } from './month';
import { isZeitraum } from '../wealth/zeitraum';

/** Existing working pages stay available until their individual migration slices are ready. */
export function PageMenu({ area, current }: { area: AreaDef; current: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const selected = area.registers.find((item) => item.id === current);
  const label = area.id === 'plan' ? 'Planansicht' : 'Vermögensansicht';
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const menu = details.current;
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        menu?.open &&
        event.target instanceof Node &&
        menu.contains(event.target)
      ) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const menu = details.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [current]);
  return (
    <details className="area-page-menu" ref={details}>
      <summary aria-label={`${label} wählen: ${selected?.label ?? area.label}`}>
        {selected?.label ?? area.label}
        <ChevronDown className="icon" size={16} aria-hidden="true" />
      </summary>
      <nav aria-label={`Ansichten von ${area.label}`}>
        {area.registers.map((item) => (
          <AppLink
            key={item.id}
            to={item.to}
            aria-current={item.id === current ? 'page' : undefined}
            search={(previous) => ({
              ...(isMonth(previous['monat']) ? { monat: previous['monat'] } : {}),
              ...(area.id === 'vermoegen' && isZeitraum(previous['zeitraum'])
                ? { zeitraum: previous['zeitraum'] }
                : {}),
            })}
            onClick={() => {
              if (details.current) details.current.open = false;
            }}
          >
            {item.label}
          </AppLink>
        ))}
      </nav>
    </details>
  );
}
