import { Count } from '@budget/ui';
import { Inbox, Plus } from 'lucide-react';
import { MAIN_AREAS, type AreaId } from '../nav/areas';
import { AppLink } from './app-link';
import { PanelLink } from './panel-link';
import { SAMPLE_INBOX_COUNT } from './inbox';
import { ThemeButton } from './theme-button';

/**
 * Register name for the phone header: "Einstellungen · Sicherheit" becomes "Sicherheit". The area
 * is already marked in the tab bar and the register row sits right below the header, so the long
 * form only got truncated ("Einstellungen · Si…").
 */
export const phoneTitle = (title: string): string => title.split(' · ').at(-1) ?? title;

/** Phone header (< 768 px): page title, inbox, theme, profile. */
export function MobileHeader({ title }: { title: string }) {
  return (
    <header className="m-head">
      <div className="m-title">
        <h1>{phoneTitle(title)}</h1>
      </div>
      <span className="spacer" />
      <PanelLink
        className="icon-btn"
        panel="posteingang"
        aria-label={`Posteingang, ${SAMPLE_INBOX_COUNT} offen`}
      >
        <Inbox size={18} strokeWidth={1.75} aria-hidden="true" />
        <Count>{SAMPLE_INBOX_COUNT}</Count>
      </PanelLink>
      <ThemeButton variant="icon" />
      <AppLink className="avatar" to="/einstellungen/konten" aria-label="Profil und Einstellungen">
        NU
      </AppLink>
    </header>
  );
}

/** Bottom tab bar with the same five areas in the same order as the sidebar, plus the + button. */
export function TabBar({ area }: { area: AreaId | undefined }) {
  return (
    <>
      <nav className="tabbar" aria-label="Hauptnavigation">
        {MAIN_AREAS.map((a) => {
          const Icon = a.icon;
          return (
            <AppLink key={a.id} to={a.to} aria-current={area === a.id ? 'page' : undefined}>
              {Icon && <Icon className="icon" size={22} strokeWidth={1.75} aria-hidden="true" />}
              {a.label}
            </AppLink>
          );
        })}
      </nav>
      <PanelLink className="fab" panel="buchung" aria-label="Buchung erfassen">
        <Plus size={26} strokeWidth={2} aria-hidden="true" />
      </PanelLink>
    </>
  );
}
