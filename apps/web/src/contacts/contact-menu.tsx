import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

/** ⋯ menu of a contact: the settle action without money movement lives here, not as a button. */
export function ContactActionsMenu({ name, onSettle }: { name: string; onSettle: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  return (
    <div
      className="contact-menu"
      ref={wrap}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="icon-btn contact-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Weitere Aktionen: ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className="contact-menu-list" role="menu" aria-label={`Aktionen: ${name}`}>
          <button
            type="button"
            role="menuitem"
            className="contact-menu-item"
            onClick={() => {
              setOpen(false);
              onSettle();
            }}
          >
            Ausgleichen ohne Geldbewegung
          </button>
        </div>
      )}
    </div>
  );
}
