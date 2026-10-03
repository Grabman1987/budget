import { setAmountsHidden, useAmountPrivacy } from '@budget/ui';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect } from 'react';

export function PrivacyButton({ text = false }: { text?: boolean }) {
  const hidden = useAmountPrivacy();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      className={text ? 'btn btn-ghost' : 'icon-btn'}
      aria-pressed={hidden}
      aria-label="Beträge verbergen"
      aria-keyshortcuts="Control+Shift+H Meta+Shift+H"
      title="Privatmodus (Strg Umschalt H)"
      onClick={() => setAmountsHidden(!hidden)}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      {text && 'Beträge verbergen'}
    </button>
  );
}
export function usePrivacyShortcut() {
  const hidden = useAmountPrivacy();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        !event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'h' ||
        event.repeat
      )
        return;
      event.preventDefault();
      setAmountsHidden(!hidden);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden]);
}
