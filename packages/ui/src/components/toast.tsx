import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { useToastHost } from './toast-host';

export interface ToastOptions {
  message: string;
  /** e.g. "Rückgängig" */
  actionLabel?: string;
  onAction?: () => void;
  /** Milliseconds until it disappears. Default 6000. */
  duration?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

const DEFAULT_DURATION = 6000;

/**
 * One toast at a time (a new one replaces the current), announced politely, with undo action.
 *
 * - The `role="status"` region is always mounted (empty while closed) so screen readers register
 *   it before the first message; only the visible body is inert and hidden when closed.
 * - The timer stops while the pointer is over the toast or focus is inside it and starts again
 *   with the full duration afterwards.
 * - While a modal panel or sheet is open the toast is rendered inside that dialog (see
 *   `toast-host.ts`), because everything outside a modal dialog is inert.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { seq: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const duration = useRef(DEFAULT_DURATION);
  const hovered = useRef(false);
  const focused = useRef(false);
  const seq = useRef(0);
  const host = useToastHost();

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    hovered.current = false;
    focused.current = false;
    setOpen(false);
  }, []);

  const start = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(dismiss, duration.current);
  }, [dismiss]);

  const show = useCallback(
    (options: ToastOptions) => {
      duration.current = options.duration ?? DEFAULT_DURATION;
      seq.current += 1;
      setCurrent({ ...options, seq: seq.current });
      setOpen(true);
      if (hovered.current || focused.current) clearTimeout(timer.current);
      else start();
    },
    [start],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  const hold = (flag: { current: boolean }, on: boolean) => {
    flag.current = on;
    if (!open) return;
    if (hovered.current || focused.current) clearTimeout(timer.current);
    else start();
  };
  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    hold(focused, false);
  };
  const onActionKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Escape') return;
    // Do not let the same key also close a modal panel the toast lives in.
    e.preventDefault();
    dismiss();
  };

  const region = (
    <div
      className={cx('toast', open && 'is-open')}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="toast-body"
        inert={!open}
        onPointerEnter={() => hold(hovered, true)}
        onPointerLeave={() => hold(hovered, false)}
        onFocus={() => hold(focused, true)}
        onBlur={onBlur}
      >
        {current && (
          <>
            <span key={current.seq}>{current.message}</span>
            {current.actionLabel && (
              <button
                type="button"
                onKeyDown={onActionKeyDown}
                onClick={() => {
                  current.onAction?.();
                  dismiss();
                }}
              >
                {current.actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {host ? createPortal(region, host) : region}
    </ToastContext.Provider>
  );
}
