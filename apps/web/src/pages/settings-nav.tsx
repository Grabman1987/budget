import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SETTINGS_GROUPS, areaById } from '../nav/areas';
import { AppLink } from '../shell/app-link';
import './settings-nav.css';

export interface SettingsNavProps {
  /** `rail`: vertical list beside the page (desktop only). `index`: full-width list (phone entry). */
  variant: 'rail' | 'index';
}

/**
 * Grouped navigation of Einstellungen (Daten, Automatik, System). One list for both layouts: the
 * rail sits left of every settings page on desktop, the index lists the same links as full-width
 * rows on the phone. The router marks the open page with `aria-current="page"` (exact match, like
 * the sidebar), so the mark follows the URL even while a lazy page is still loading.
 */
export function SettingsNav({ variant }: SettingsNavProps) {
  return (
    <nav className={`settings-nav settings-nav-${variant}`} aria-label="Einstellungen">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.id} className="settings-group">
          <p className="tech settings-group-label" id={`settings-group-${group.id}`}>
            {group.label}
          </p>
          <ul aria-labelledby={`settings-group-${group.id}`}>
            {group.items.map((item) => (
              <li key={item.id}>
                <AppLink to={item.to}>
                  <span className="settings-item-label">{item.label}</span>
                  <ChevronRight
                    className="settings-chevron"
                    size={18}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </AppLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone only: back link to the index plus the name of the open page (the title block has no room). */
export function SettingsBack({ current }: { current: string | undefined }) {
  const label = areaById('einstellungen').registers.find((r) => r.id === current)?.label;
  return (
    <div className="settings-back">
      <AppLink to="/einstellungen">
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        Einstellungen
      </AppLink>
      {label && <span className="settings-here">{label}</span>}
    </div>
  );
}
