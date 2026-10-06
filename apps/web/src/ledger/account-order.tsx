import { cx } from '@budget/ui';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useBudgetWrite } from '../budget/use-category-writes';
import { orderAccounts } from './api';
import {
  applyOrder,
  clampDrag,
  dragTarget,
  fullOrderWith,
  moveTo,
  shiftFor,
  stepId,
  type RowBox,
} from './account-order-model';
import './account-order.css';
import type { AccountGroupId } from './labels';
import type { AccountRow } from './types';

/**
 * The owner's account order (like YNAB's edit mode): within a group, by drag and drop (mouse, pen
 * and touch share pointer events), by the ↑ / ↓ buttons or by the arrow keys on the grip. The
 * groups themselves stay in their fixed order. Each change is one audited write with "Rückgängig".
 */

/**
 * Accounts with the order of moves that are still being saved already applied, so the lists do
 * not jump back while the write and the refresh run. `save` takes one group's new order; writes
 * run one after the other, each computed from the latest order.
 */
export function useOrderedAccounts(accounts: AccountRow[] | undefined) {
  const write = useBudgetWrite();
  const [override, setOverride] = useState<string[] | null>(null);
  const shown = useMemo(
    () => (accounts && override ? applyOrder(accounts, override) : accounts),
    [accounts, override],
  );
  const latest = useRef(shown);
  useLayoutEffect(() => {
    latest.current = shown;
  }, [shown]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);

  const save = useCallback(
    (groupId: AccountGroupId, groupIds: string[]) => {
      const current = latest.current;
      if (!current) return;
      const next = fullOrderWith(current, groupId, groupIds);
      latest.current = applyOrder(current, next);
      setOverride(next);
      inFlight.current += 1;
      queue.current = queue.current
        .then(() =>
          write(
            () => orderAccounts(next),
            () => 'Reihenfolge der Konten gespeichert.',
          ),
        )
        .finally(() => {
          inFlight.current -= 1;
          if (inFlight.current === 0) setOverride(null);
        });
    },
    [write],
  );
  return { accounts: shown, save };
}

interface DragState {
  id: string;
  from: number;
  target: number;
  dy: number;
  height: number;
}
type Part = 'grip' | 'up' | 'down';

/**
 * Reordering of one list of rows (the accounts of one group). `rowProps(id)` goes on every row,
 * `controls(id)` renders grip and ↑ / ↓ buttons. While dragging, the rows keep their DOM place
 * and move by transforms, so the pointer stays with the grip; the order is committed on release.
 */
export function useReorder(
  ids: string[],
  onReorder: (ids: string[]) => void,
  labelOf: (id: string) => string,
) {
  const scope = useId();
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusAfter = useRef<{ id: string; part: Part } | null>(null);
  const live = useRef({ ids, onReorder, labelOf });
  useLayoutEffect(() => {
    live.current = { ids, onReorder, labelOf };
  });
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const commit = (order: string[], id: string, part: Part) => {
    focusAfter.current = { id, part };
    setAnnouncement(
      `${live.current.labelOf(id)}, Position ${order.indexOf(id) + 1} von ${order.length}`,
    );
    live.current.onReorder(order);
  };

  const step = (id: string, delta: -1 | 1, part: Part) => {
    const next = stepId(live.current.ids, id, delta);
    if (next.join() !== live.current.ids.join()) commit(next, id, part);
  };

  // Keep keyboard focus on the control that was used, also after the row moved (or, at the end
  // of the list, on its other arrow button).
  useLayoutEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const find = (part: Part) =>
      document.querySelector<HTMLButtonElement>(
        `[data-reorder="${CSS.escape(`${scope}:${target.id}:${part}`)}"]`,
      );
    const wanted = find(target.part);
    const other = find(target.part === 'up' ? 'down' : target.part === 'down' ? 'up' : 'grip');
    // A finished pointer drag must not scroll the page (a taller fixed tab bar may cover the row).
    (wanted && !wanted.disabled ? wanted : other)?.focus({ preventScroll: target.part === 'grip' });
  }, [ids, scope]);

  const startDrag = (id: string, event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const current = live.current.ids;
    const boxes: RowBox[] = [];
    for (const rowId of current) {
      const el = rows.current.get(rowId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      boxes.push({ id: rowId, top: rect.top, height: rect.height });
    }
    const from = current.indexOf(id);
    const mine = boxes[from];
    if (!mine) return;
    const startY = event.clientY;
    let state: DragState = { id, from, target: from, dy: 0, height: mine.height };
    setDrag(state);

    const move = (e: globalThis.PointerEvent) => {
      const dy = clampDrag(boxes, id, e.clientY - startY);
      state = { ...state, dy, target: dragTarget(boxes, id, dy) };
      setDrag(state);
    };
    const finish = (apply: boolean) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', key);
      cancel.current = null;
      setDrag(null);
      if (apply && state.target !== state.from)
        commit(moveTo(current, from, state.target), id, 'grip');
    };
    const up = () => finish(true);
    const abort = () => finish(false);
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', key);
    cancel.current = abort;
  };

  const rowProps = (id: string) => {
    const lifted = drag?.id === id;
    let style: CSSProperties | undefined;
    if (drag && lifted) style = { transform: `translateY(${drag.dy}px)` };
    else if (drag) {
      const shift = shiftFor(ids.indexOf(id), drag.from, drag.target, drag.height);
      if (shift) style = { transform: `translateY(${shift}px)` };
    }
    return {
      ref: (el: HTMLElement | null) => {
        if (el) rows.current.set(id, el);
        else rows.current.delete(id);
      },
      className: cx('reorder-row', drag && 'is-reordering', lifted && 'is-lifted'),
      style,
    };
  };

  const onGripKey = (id: string, event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    step(id, event.key === 'ArrowUp' ? -1 : 1, 'grip');
  };

  /** Grip, ↑ and ↓ of one row. */
  const controls = (id: string) => {
    const index = ids.indexOf(id);
    const name = labelOf(id);
    const key = (part: Part) => `${scope}:${id}:${part}`;
    return (
      <span className="order-controls">
        <button
          type="button"
          className="icon-btn order-grip"
          aria-label={`${name} verschieben (ziehen oder Pfeiltasten)`}
          data-reorder={key('grip')}
          onPointerDown={(e) => startDrag(id, e)}
          onKeyDown={(e) => onGripKey(id, e)}
        >
          <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn order-step"
          aria-label={`${name} nach oben`}
          data-reorder={key('up')}
          disabled={index <= 0}
          onClick={() => step(id, -1, 'up')}
        >
          <ArrowUp size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn order-step"
          aria-label={`${name} nach unten`}
          data-reorder={key('down')}
          disabled={index < 0 || index >= ids.length - 1}
          onClick={() => step(id, 1, 'down')}
        >
          <ArrowDown size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </span>
    );
  };

  const status = (
    <span className="sr-only" role="status" aria-live="polite">
      {announcement}
    </span>
  );
  return { rowProps, controls, status, dragging: drag?.id ?? null };
}
