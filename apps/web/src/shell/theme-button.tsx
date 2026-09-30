import { useTheme } from '@budget/ui';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeSystem(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const systemIsDark = () => window.matchMedia(DARK_QUERY).matches;

/**
 * Sidebar entry (with label) or icon-only button in the phone header, as in the prototype: the
 * button names what it switches to ("Dunkle Blaupause" with a moon in light mode, "Heller
 * Zeichenfilm" with a sun in dark mode). Until the first switch the app follows the system
 * setting; the explicit choice is remembered from then on.
 */
export function ThemeButton({ variant }: { variant: 'side' | 'icon' }) {
  const [preference, setTheme] = useTheme();
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false);
  const dark = preference === 'system' ? systemDark : preference === 'dark';
  const label = dark ? 'Heller Zeichenfilm' : 'Dunkle Blaupause';
  const Icon = dark ? Sun : Moon;
  const toggle = () => setTheme(dark ? 'light' : 'dark');
  if (variant === 'icon') {
    return (
      <button type="button" className="icon-btn" onClick={toggle} aria-label={label}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button type="button" className="side-btn" onClick={toggle} title="Hell/Dunkel umschalten">
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="label">{label}</span>
    </button>
  );
}
