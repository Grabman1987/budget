import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';
import { useRegisterToastHost } from './toast-host';
import { useIsPhone } from './use-media-query';

export interface PanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * Asked before Esc, the close button or a click on the backdrop closes the panel. Return
   * `false` to keep it open (e.g. to ask whether unsaved input may be discarded).
   */
  beforeClose?: () => boolean;
  /** Shown in the head next to the title (e.g. a count); not part of the dialog's name. */
  headAside?: ReactNode;
  /** Make a long body a named keyboard-scrollable region. Opt in only when the body overflows. */
  focusableBody?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The control the last tap or click landed on. Safari (macOS and iOS) does not focus a button or
 * link that is clicked, so at the moment a panel opens `document.activeElement` can be the body
 * or an earlier navigation control. The panel remembers the actual opener
 * instead (only a recent one: a panel opened by a deep link has no trigger).
 */
let lastPointerTrigger: { element: Element; at: number } | undefined;
if (typeof document !== 'undefined') {
  const remember = (e: Event) => {
    const target = e.target instanceof Element ? e.target.closest(FOCUSABLE) : null;
    lastPointerTrigger = target ? { element: target, at: Date.now() } : undefined;
  };
  // Pointer, touch and click: the engines differ in which of them a tap produces.
  for (const type of ['pointerdown', 'touchstart', 'mousedown', 'click'])
    document.addEventListener(type, remember, { capture: true, passive: true });
}
const TRIGGER_MAX_AGE_MS = 2000;

/** A recent connected trigger wins: Safari can leave focus on an earlier navigation control. */
function focusReturnTarget(): HTMLElement | null {
  if (lastPointerTrigger && Date.now() - lastPointerTrigger.at < TRIGGER_MAX_AGE_MS) {
    const el = lastPointerTrigger.element;
    if (el instanceof HTMLElement && el.isConnected) return el;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  return null;
}

/**
 * Keeps Tab inside a large dialog: the native modal makes the page behind inert, but Chrome would
 * hand the focus on to its own toolbar after the last control. Wrap to the other end instead.
 */
function wrapTab(e: KeyboardEvent<HTMLDialogElement>, dialog: HTMLDialogElement) {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.getClientRects().length > 0,
  );
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === dialog)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Modal overlay on the native `<dialog>`: focus is trapped, Esc closes, the page behind is inert,
 * focus returns to the trigger. The scrim is the dialog backdrop; clicking it closes. The dialog
 * is named by its visible heading. It also hosts the toast while it is open.
 */
function Overlay({
  open,
  onClose,
  title,
  children,
  variant,
  beforeClose,
  headAside,
  focusableBody = false,
  bare = false,
  wide = false,
}: PanelProps & { variant: 'side' | 'bottom' | 'modal'; bare?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Toasts render inside the open dialog: everything outside a modal dialog is inert.
  const [toastHost, setToastHost] = useState<HTMLElement | null>(null);
  useRegisterToastHost(toastHost, open);

  const requestClose = () => {
    if (beforeClose && !beforeClose()) return;
    onClose();
  };

  const returnTo = useRef<HTMLElement | null>(null);
  /** After the dialog closed: the native focus return, or ours where Safari gave none. */
  const restoreFocus = () => {
    const target = returnTo.current;
    returnTo.current = null;
    if (!target || !target.isConnected) return;
    // Native WebKit can restore the previously active main/navigation control because tapping
    // the actual opener did not focus it. Always return to our captured, connected trigger.
    target.focus({ preventScroll: true });
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = focusReturnTarget();
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      restoreFocus();
    }
  }, [open]);

  return (
    // The backdrop click is a pointer convenience only; the keyboard closes with Esc (native).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={cx(
        'overlay',
        variant === 'side' ? 'panel' : variant === 'modal' ? 'modal' : 'sheet-bottom',
        bare && 'is-bare',
        wide && (variant === 'modal' ? 'is-wide' : 'is-full'),
      )}
      aria-labelledby={titleId}
      onClose={() => {
        restoreFocus();
        onClose();
      }}
      // Esc: the native cancel event, stopped while the guard wants the panel to stay.
      onCancel={(e) => {
        if (beforeClose && !beforeClose()) e.preventDefault();
      }}
      // Chrome only fires `cancel` for an Esc that follows a user interaction: a repeated Esc
      // would close the dialog without the question. Handling the key itself always asks.
      onKeyDown={(e) => {
        if (wide && e.key === 'Tab' && !e.defaultPrevented) wrapTab(e, e.currentTarget);
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      {/* Bare: the content draws its own head and footer; the title stays as the dialog's name. */}
      {bare && (
        <div className="overlay-inner">
          {variant === 'bottom' && <span className="sheet-grip" aria-hidden="true" />}
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {children}
        </div>
      )}
      {!bare && open && (
        <div className="overlay-inner">
          {variant === 'bottom' && <span className="sheet-grip" aria-hidden="true" />}
          <div className="panel-head">
            <h2 id={titleId}>{title}</h2>
            {headAside}
            <button
              type="button"
              className="icon-btn"
              aria-label="Schließen"
              onClick={requestClose}
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
              <span className="control-label" aria-hidden="true">
                Schließen
              </span>
            </button>
          </div>
          <div
            className="panel-body"
            role={focusableBody ? 'region' : undefined}
            aria-labelledby={focusableBody ? titleId : undefined}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll long dialog content.
            tabIndex={wide || focusableBody ? 0 : undefined}
          >
            {variant === 'side' && <div className="panel-graticule" aria-hidden="true" />}
            {children}
          </div>
        </div>
      )}
      <div ref={setToastHost} className="toast-host" />
    </dialog>
  );
}

/** Desktop: details slide in from the right (420 px). */
export function SidePanel(props: PanelProps) {
  return <Overlay {...props} variant="side" />;
}

/** Phone: details rise from the bottom as a sheet (16 px top radius). */
export function BottomSheet(props: PanelProps) {
  return <Overlay {...props} variant="bottom" />;
}

/**
 * Form dialog: a centred modal card on desktop, a bottom sheet below 768 px. The content brings
 * its own head and sticky footer (`.bk-head`, `.bk-body`, `.bk-foot`); `title` only names the
 * dialog. The caller decides when the content is mounted (it is kept while the dialog fades out).
 */
export function FormDialog(props: PanelProps) {
  const phone = useIsPhone();
  return <Overlay {...props} variant={phone ? 'bottom' : 'modal'} bare />;
}

/**
 * Large work dialog (e.g. the Posteingang): a centred modal up to 960 px wide and 85 % of the
 * screen high on desktop and tablet, a full-screen sheet below 768 px. The head (title, optional
 * `headAside`, close) stays put; the body scrolls. Native `<dialog>`: focus trap, Esc, backdrop
 * click and focus return to the trigger come with it.
 */
export function WideDialog(props: PanelProps) {
  const phone = useIsPhone();
  return <Overlay {...props} variant={phone ? 'bottom' : 'modal'} wide />;
}

/** Side panel on desktop, bottom sheet below 768 px. */
export function DetailPanel(props: PanelProps) {
  const phone = useIsPhone();
  return phone ? <BottomSheet {...props} /> : <SidePanel {...props} />;
}
