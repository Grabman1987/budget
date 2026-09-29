import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';
import { useIsPhone } from './use-media-query';

export interface PanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Modal overlay on the native `<dialog>`: focus is trapped, Esc closes, the page behind is inert,
 * focus returns to the trigger. The scrim is the dialog backdrop; clicking it closes.
 */
function Overlay({
  open,
  onClose,
  title,
  children,
  variant,
}: PanelProps & { variant: 'side' | 'bottom' }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx('overlay', variant === 'side' ? 'panel' : 'sheet-bottom')}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="overlay-inner">
          {variant === 'bottom' && <span className="sheet-grip" aria-hidden="true" />}
          <div className="panel-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose}>
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          <div className="panel-body">
            {variant === 'side' && <div className="panel-graticule" aria-hidden="true" />}
            {children}
          </div>
        </div>
      )}
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

/** Side panel on desktop, bottom sheet below 768 px. */
export function DetailPanel(props: PanelProps) {
  const phone = useIsPhone();
  return phone ? <BottomSheet {...props} /> : <SidePanel {...props} />;
}
