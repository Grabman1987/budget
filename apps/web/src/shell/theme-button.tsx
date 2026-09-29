import { useTheme } from '@budget/ui';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const query = '(prefers-color-scheme: dark)';
const subscribe = (notify: () => void) => {
  const list = window.matchMedia(query);
  list.addEventListener('change', notify);
  return () => list.removeEventListener('change', notify);
};

/** Effective theme: the manual override, otherwise the system preference. */
export function useIsDark(): [boolean, () => void] {
  const [preference, setTheme] = useTheme();
  const system = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
  const dark = preference === 'system' ? system : preference === 'dark';
  return [dark, () => setTheme(dark ? 'light' : 'dark')];
}

/** Sidebar entry (with label) or icon-only button in the phone header. */
export function ThemeButton({ variant }: { variant: 'side' | 'icon' }) {
  const [dark, toggle] = useIsDark();
  const Icon = dark ? Sun : Moon;
  const label = dark ? 'Heller Zeichenfilm' : 'Dunkle Blaupause';
  if (variant === 'icon') {
    return (
      <button type="button" className="icon-btn" onClick={toggle} aria-label={label}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button type="button" className="side-btn" onClick={toggle} title={label} aria-label={label}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="label">{label}</span>
    </button>
  );
}
