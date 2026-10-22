import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from '@tanstack/react-router';
import { SETTINGS_SECTIONS } from '../settings/navigation';
import { AppLink } from '../shell/app-link';
import './settings-nav.css';

export interface SettingsNavProps {
  /** `rail`: vertical list beside the page (desktop only). `index`: full-width list (phone entry). */
  variant: 'rail' | 'index';
}

/**
 * The six task sections of Einstellungen. One list for both layouts: the
 * rail sits left of every settings page on desktop, the index lists the same links as full-width
 * rows on the phone. The current section remains marked on its nested editor routes,
 * including while a lazy page is still loading.
 */
export function SettingsNav({ variant }: SettingsNavProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <nav className={`settings-nav settings-nav-${variant}`} aria-label="Einstellungen">
      <ul>
        {SETTINGS_SECTIONS.map((section) => (
          <li key={section.id}>
            <AppLink to={section.to} aria-current={pathname === section.to || pathname.startsWith(`${section.to}/`) ? 'page' : undefined}>
              <span className="settings-item-label">{section.label}</span>
              <ChevronRight className="settings-chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
            </AppLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phone only: back link to the index plus the name of the open page (the title block has no room). */
export function SettingsBack({ current }: { current: string | undefined }) {
  const label = SETTINGS_SECTIONS.find((section) => section.id === current)?.label;
  return (
    <div className="settings-back">
      <AppLink to="/einstellungen">
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Einstellungen
      </AppLink>
      {label && <span className="settings-here">{label}</span>}
    </div>
  );
}
