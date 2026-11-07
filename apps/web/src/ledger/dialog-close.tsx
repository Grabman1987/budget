import { X } from 'lucide-react';

/** Shared account/booking dialog close target; native dialog Escape stays with FormDialog. */
export function DialogClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn bk-close"
      aria-label="Schließen"
      title="Schließen"
      onClick={onClick}
    >
      <X size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
