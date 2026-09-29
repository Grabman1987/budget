import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from './cx';

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

/** One toast at a time (a new one replaces the current), announced politely, with undo action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastOptions | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimeout(timer.current);
      setCurrent(options);
      setOpen(true);
      timer.current = setTimeout(dismiss, options.duration ?? 6000);
    },
    [dismiss],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={cx('toast', open && 'is-open')}
        role="status"
        aria-live="polite"
        inert={!open}
      >
        {current && (
          <>
            <span>{current.message}</span>
            {current.actionLabel && (
              <button
                type="button"
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
    </ToastContext.Provider>
  );
}
