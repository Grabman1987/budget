import { Count } from '@budget/ui';
import { Inbox, Plus } from 'lucide-react';
import { MAIN_AREAS, areaById, type AreaId } from '../nav/areas';
import { monthLabel } from '../nav/month';
import type { PageMeta } from '../nav/pages';
import { AppLink } from './app-link';
import { PanelLink } from './panel-link';
import { useInboxCount } from './inbox';
import { ThemeButton } from './theme-button';

/**
 * What the phone header shows, as in the prototype: the month on Heute, the area name on the other
 * areas (the register row and the title-block strip below say which view it is), the report name
 * on a single report. Long "Area · Register" titles only got truncated ("Einstellungen · Si…").
 */
export function phoneTitle(page: PageMeta | undefined, month: string, fallback: string): string {
  if (!page) return fallback;
  if (page.area === 'heute') return monthLabel(month);
  if (page.area === 'reports') {
    return page.title === 'Reports' || page.title.startsWith('Reports · ') ? 'Reports' : page.title;
  }
  return areaById(page.area).label;
}

/** Phone header (< 768 px): page title, inbox, theme, profile. */
export function MobileHeader({ title, asHeading }: { title: string; asHeading: boolean }) {
  const inboxCount = useInboxCount() ?? 0;
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
      <AppLink
        className="icon-btn"
        to="/konten/posteingang"
        aria-label={`Posteingang, ${inboxCount} offen`}
      >
        <Inbox size={18} strokeWidth={1.75} aria-hidden="true" />
        {inboxCount > 0 && <Count>{inboxCount}</Count>}
      </AppLink>
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
