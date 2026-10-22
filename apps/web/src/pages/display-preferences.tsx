import {
  Button,
  SectionHead,
  Segmented,
  setAmountsHidden,
  useAmountPrivacy,
  useTheme,
  useToast,
  type ThemePreference,
} from '@budget/ui';
import { Eye, EyeOff } from 'lucide-react';
import './profile-settings.css';

const THEMES: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

/** Device preferences apply immediately; these controls never write profile or ledger data. */
export function DisplayPreferences() {
  const [theme, setTheme] = useTheme();
  const hidden = useAmountPrivacy();
  const toast = useToast();
  const PrivacyIcon = hidden ? EyeOff : Eye;
  const changeTheme = (next: ThemePreference) => {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    toast.show({
      message: 'Darstellung geändert.',
      actionLabel: 'Rückgängig',
      onAction: () => setTheme(previous),
    });
  };
  const changePrivacy = () => {
    const previous = hidden;
    setAmountsHidden(!previous);
    toast.show({
      message: previous ? 'Beträge werden angezeigt.' : 'Beträge werden verborgen.',
      actionLabel: 'Rückgängig',
      onAction: () => setAmountsHidden(previous),
    });
  };
  return (
    <section className="profile-settings display-preferences" aria-labelledby="display-title">
      <SectionHead id="display-title" title="Darstellung" />
      <Segmented
        label="Farbdarstellung"
        options={THEMES}
        value={theme}
        onChange={changeTheme}
      />
      <p className="preference-help">
        Automatisch folgt der hellen oder dunklen Darstellung deines Geräts.
        Änderungen gelten sofort auf diesem Gerät.
      </p>
      <Button
        variant="ghost"
        aria-pressed={hidden}
        aria-keyshortcuts="Control+Shift+H Meta+Shift+H"
        onClick={changePrivacy}
      >
        <PrivacyIcon size={16} strokeWidth={1.75} aria-hidden="true" />
        Beträge verbergen
      </Button>
      <p className="preference-help" role="status">
        {hidden ? 'Beträge sind verborgen.' : 'Beträge sind sichtbar.'}{' '}
        Strg Umschalt H schaltet die Sichtbarkeit um. Buchungen und Berechnungen bleiben unverändert.
      </p>
    </section>
  );
}
