import { useTheme, type ThemePreference } from '@budget/ui';
import { Monitor, Moon, Sun } from 'lucide-react';

/** Cycle order: follow the system, then force light, then force dark, then back to the system. */
const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const CHOICE: Record<ThemePreference, { label: string; Icon: typeof Sun }> = {
  system: { label: 'System', Icon: Monitor },
  light: { label: 'Heller Zeichenfilm', Icon: Sun },
  dark: { label: 'Dunkle Blaupause', Icon: Moon },
};

/**
 * Sidebar entry (with label) or icon-only button in the phone header. Shows the current choice
 * (System, Heller Zeichenfilm, Dunkle Blaupause); each activation moves to the next one.
 */
export function ThemeButton({ variant }: { variant: 'side' | 'icon' }) {
  const [preference, setTheme] = useTheme();
  const { label, Icon } = CHOICE[preference];
  const next = () => setTheme(NEXT[preference]);
  const name = `${label}, Darstellung wechseln`;
  if (variant === 'icon') {
    return (
      <button type="button" className="icon-btn" onClick={next} aria-label={name}>
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button type="button" className="side-btn" onClick={next} title={name} aria-label={name}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="label">{label}</span>
    </button>
  );
}
