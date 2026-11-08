import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { CategoryTree } from './api';
import { sortCategories } from './api';
import { orderOf, sameOrder, stepGroup, type Order } from './categories-model';
import { CategorySortHandle } from './category-sort-handle';
import { useBudgetWrite } from './use-category-writes';
import { useIsPhone } from './month-span';

/** Reuse the complete settings order, including hidden categories, and its audited writer. */
export function usePlanGroupOrder(tree: CategoryTree | undefined) {
  const write = useBudgetWrite();
  const [pending, setPending] = useState<Order | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const phone = useIsPhone();
  const busy = useRef(false);
  const refocus = useRef<string | null>(null);
  const order = pending ?? (tree ? orderOf(tree) : []);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    const handle = [
      ...document.querySelectorAll<HTMLButtonElement>('.plan-group-sort [data-focus-key]'),
    ].find((element) => element.dataset['focusKey'] === refocus.current);
    if (handle && (!document.activeElement || document.activeElement === document.body))
      handle.focus();
    if (pending === null) refocus.current = null;
  });
  const save = async (next: Order) => {
    if (busy.current || sameOrder(order, next)) return;
    busy.current = true;
    setPending(next);
    try {
      await write(
        () => sortCategories(next),
        () => 'Reihenfolge gespeichert.',
      );
    } finally {
      busy.current = false;
      setPending(null);
    }
  };
  const step = (id: string, delta: -1 | 1) => {
    refocus.current = id;
    void save(stepGroup(order, id, delta));
  };
  return {
    order,
    dropTarget: (id: string) => ({
      onDragOver: (event: DragEvent) => {
        if (drag && !busy.current) event.preventDefault();
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        if (!drag || drag === id) {
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
        if (moved && targetIndex >= 0) void save([...rest.slice(0, at), moved, ...rest.slice(at)]);
        setDrag(null);
      },
    }),
    handle: (id: string, name: string) => (
      <span className="plan-group-sort" data-open={phone && expanded === id}>
        <CategorySortHandle
          label={`Gruppe ${name} verschieben`}
          focusKey={id}
          title="Ziehen oder mit Pfeil nach oben/unten verschieben"
          aria-disabled={!tree || pending !== null}
          aria-expanded={phone ? expanded === id : undefined}
          onClick={() => {
            if (phone) setExpanded((current) => (current === id ? null : id));
          }}
          draggable={!!tree && pending === null}
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', id);
            event.dataTransfer.effectAllowed = 'move';
            setDrag(id);
          }}
          onDragEnd={() => setDrag(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            if (tree) step(id, event.key === 'ArrowUp' ? -1 : 1);
          }}
        />
        <span className="plan-group-step">
          <button
            type="button"
            aria-label={`Gruppe ${name} nach oben`}
            disabled={!tree || pending !== null || order[0]?.id === id}
            onClick={() => step(id, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Gruppe ${name} nach unten`}
            disabled={!tree || pending !== null || order.at(-1)?.id === id}
            onClick={() => step(id, 1)}
          >
            ↓
          </button>
        </span>
      </span>
    ),
  };
}
