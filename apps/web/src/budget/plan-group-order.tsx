import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { CategoryTree } from './api';
import { sortCategories } from './api';
import { orderOf, sameOrder, type Order } from './categories-model';
import { CategorySortHandle } from './category-sort-handle';
import { useBudgetWrite } from './use-category-writes';
import { useIsPhone } from './month-span';

/** Reuse the complete settings order, including hidden categories, and its audited writer. */
export function usePlanGroupOrder(tree: CategoryTree | undefined) {
  const write = useBudgetWrite();
  const [pending, setPending] = useState<Order | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const phone = useIsPhone();
  const busy = useRef(false);
  const refocus = useRef<{ id: string; origin: Element | null } | null>(null);
  const order = pending ?? (tree ? orderOf(tree) : []);
  const disabled = !tree || pending !== null;
  useLayoutEffect(() => {
    if (!refocus.current) return;
    const handle = [
      ...document.querySelectorAll<HTMLButtonElement>('.plan-group-sort [data-focus-key]'),
    ].find((element) => element.dataset['focusKey'] === refocus.current?.id);
    if (
      handle &&
      (!document.activeElement ||
        document.activeElement === document.body ||
        document.activeElement === refocus.current.origin ||
        document.activeElement.closest('.plan-group-sort'))
    )
      handle.focus();
    if (pending === null) refocus.current = null;
  });
  const save = async (next: Order, id: string, delta: -1 | 1) => {
    if (!tree || busy.current || sameOrder(order, next)) return;
    busy.current = true;
    refocus.current = { id, origin: document.activeElement };
    setAnnouncement('');
    setPending(next);
    try {
      const result = await write(
        () => sortCategories(next),
        () => 'Reihenfolge gespeichert.',
      );
      if (result) setAnnouncement(`Gruppe nach ${delta === -1 ? 'oben' : 'unten'} verschoben`);
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const step = (id: string, delta: -1 | 1, visibleIds: readonly string[]) => {
    if (disabled || busy.current) return;
    const visible = order.filter((group) => visibleIds.includes(group.id));
    const neighbour = visible[visible.findIndex((group) => group.id === id) + delta];
    if (!neighbour) return;
    const from = order.findIndex((group) => group.id === id);
    const to = order.findIndex((group) => group.id === neighbour.id);
    if (from < 0) return;
    const next = [...order];
    [next[from], next[to]] = [next[to]!, next[from]!];
    void save(next, id, delta);
  };
  return {
    order,
    announcement,
    dropTarget: (id: string) => ({
      onDragOver: (event: DragEvent) => {
        if (drag && !disabled && !busy.current) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (disabled || busy.current || !drag || drag === id) {
          setDrag(null);
          return;
        }
        const moved = order.find((group) => group.id === drag);
        const rest = order.filter((group) => group.id !== drag);
        const targetIndex = rest.findIndex((group) => group.id === id);
        const downward =
          order.findIndex((group) => group.id === drag) <
          order.findIndex((group) => group.id === id);
        const at = targetIndex + (downward ? 1 : 0);
        if (moved && targetIndex >= 0)
          void save([...rest.slice(0, at), moved, ...rest.slice(at)], drag, downward ? 1 : -1);
        setDrag(null);
      },
    }),
    handle: (id: string, name: string, visibleIds: readonly string[] = order.map((g) => g.id)) => (
      <span className="plan-group-sort" data-open={phone && expanded === id}>
        <CategorySortHandle
          label={`Gruppe ${name} verschieben`}
          focusKey={id}
          title="Ziehen oder mit Pfeil nach oben/unten verschieben"
          aria-disabled={disabled}
          aria-expanded={phone ? expanded === id : undefined}
          onClick={() => {
            if (!disabled && phone) setExpanded((current) => (current === id ? null : id));
          }}
          draggable={!disabled}
          onDragStart={(event) => {
            if (disabled || busy.current) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData('text/plain', id);
            event.dataTransfer.effectAllowed = 'move';
            setDrag(id);
          }}
          onDragEnd={() => setDrag(null)}
          onKeyDown={(event) => {
            if (disabled || busy.current) return;
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            step(id, event.key === 'ArrowUp' ? -1 : 1, visibleIds);
          }}
        />
        <span className="plan-group-step">
          <button
            type="button"
            aria-label={`Gruppe ${name} nach oben`}
            disabled={disabled || order.find((group) => visibleIds.includes(group.id))?.id === id}
            onClick={() => step(id, -1, visibleIds)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Gruppe ${name} nach unten`}
            disabled={
              disabled || order.filter((group) => visibleIds.includes(group.id)).at(-1)?.id === id
            }
            onClick={() => step(id, 1, visibleIds)}
          >
            ↓
          </button>
        </span>
      </span>
    ),
  };
}
