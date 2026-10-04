import { Count } from '@budget/ui';
import { Inbox, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { MAIN_AREAS, areaById, type AreaId } from '../nav/areas';
import type { PageMeta } from '../nav/pages';
import { AppLink } from './app-link';
import { PanelLink } from './panel-link';
import { useInboxCount } from './inbox';
import { GlobalSearch } from './global-search';
import { ThemeButton } from './theme-button';
import { useShellIdentity } from './use-profile';
import { QueueBadge } from '../pwa/queue-ui';
import { PrivacyButton } from './privacy-button';

/**
 * What the phone header shows, as in the prototype: the area name (the month switch and the strip
 * below say which month and view it is), the report name
 * on a single report. Long "Area · Register" titles only got truncated ("Einstellungen · Si…").
 */
export function phoneTitle(page: PageMeta | undefined, fallback: string): string {
  if (!page) return fallback;
  if (page.area === 'reports') {
    return page.title === 'Reports' || page.title.startsWith('Reports · ') ? 'Reports' : page.title;
  }
  return areaById(page.area).label;
}

/** Phone header (< 768 px): page title, inbox, theme, profile. */
export function MobileHeader({ title, asHeading }: { title: string; asHeading: boolean }) {
  const inbox = useInboxCount();
  const identity = useShellIdentity();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = profileMenu.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    };
    const onOutside = (event: PointerEvent) => {
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    };
    menu?.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      menu?.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, []);
  return (
    <header className="m-head">
      <div className="m-title">
        {asHeading ? (
          <h1 className="m-title-text">{title}</h1>
        ) : (
          <p className="m-title-text">{title}</p>
        )}
      </div>
      <span className="spacer" />
      <PanelLink className="icon-btn" panel="posteingang" aria-label={inbox.label}>
        <Inbox size={18} strokeWidth={1.75} aria-hidden="true" />
        {inbox.count !== undefined && inbox.count > 0 && <Count>{inbox.count}</Count>}
      </PanelLink>
      <ThemeButton variant="icon" />
      <details className="m-profile" ref={profileMenu}>
        <summary className="avatar" aria-label={`${identity.name}: Profilmenü`}>
          {identity.initials}
        </summary>
        <div className="m-profile-actions">
          <PrivacyButton text />
          <AppLink
            className="btn btn-ghost"
            to="/einstellungen"
            onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
          >
            Profil und Einstellungen
          </AppLink>
        </div>
      </details>
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
              {(a.id === 'heute' || a.id === 'konten') && <QueueBadge />}
            </AppLink>
          );
        })}
      </nav>
      <GlobalSearch mobile />
      <nav aria-label="Schnellerfassung">
        <PanelLink className="fab" panel="buchung" aria-label="Buchung erfassen">
          <Plus size={26} strokeWidth={2} aria-hidden="true" />
        </PanelLink>
      </nav>
    </>
  );
}
