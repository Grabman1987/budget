import { useEffect, useRef, type ReactNode } from 'react';
import { areaById } from '../nav/areas';
import { PageMenu } from '../nav/page-menu';
import './plan-page-frame.css';
import { useMonthKeys } from '../shell/month-switch';
import { useMonth } from '../shell/use-month';

/** Plan's v2 page rail. The working body and all writers stay with their destination. */
export function PlanPageFrame({
  page,
  title,
  actions,
  period,
  className = '',
  children,
  heading = true,
}: {
  page: 'monat' | 'jahr' | 'erwartet' | 'sparziele' | 'prognose';
  title: string;
  actions?: ReactNode;
  period?: ReactNode;
  className?: string;
  children: ReactNode;
  heading?: boolean;
}) {
  const [, shiftMonth] = useMonth();
  useMonthKeys(shiftMonth, page !== 'monat' && page !== 'jahr');
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      for (const menu of root.current?.querySelectorAll<HTMLDetailsElement>(
        '.plan-v2-view[open], .year-reference-context[open], .year-chart-reference-extra[open]',
      ) ?? []) {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !(event.target instanceof Element))
        return;
      const menu = event.target.closest<HTMLDetailsElement>(
        '.plan-v2-view[open], .year-reference-context[open], .year-chart-reference-extra[open]',
      );
      if (menu && root.current?.contains(menu)) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <div ref={root} className={'plan-v2-page ' + className} data-plan-page={page}>
      {heading && <h1 className="sr-only">{title}</h1>}
      <div className="plan-v2-page-head">
        <PageMenu area={areaById('plan')} current={page} />
        {period}
        <div className="plan-v2-page-actions">{actions}</div>
      </div>
      {children}
    </div>
  );
}
