import { cx } from '@budget/ui';
import { Settings } from 'lucide-react';
import { MAIN_AREAS, type AreaId } from '../nav/areas';
import { AppLink } from './app-link';
import { ThemeButton } from './theme-button';

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 13.5 12 9.5l5 3.5 8-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7 22h18" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.8 23.4 8.2 20.6M23.8 23.4l2.4-2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M7 18.5v6M25 18.5v6" stroke="currentColor" strokeWidth="1" opacity=".55" />
    </svg>
  );
}

/** "Planliste": the five areas as numbered sheets, settings and profile at the bottom. */
export function Sidebar({ area }: { area: AreaId | undefined }) {
  return (
    <aside className="sidebar" id="sidebar" aria-label="Seitenleiste">
      <AppLink className="brand" to="/" aria-label="Budget, Heute">
        <BrandMark />
        <span className="brand-name">Budget</span>
      </AppLink>

      <nav className="planliste" aria-labelledby="planliste">
        <div className="sheetlist-label tech" id="planliste">
          Planliste
        </div>
        <ul className="sheetlist">
          {MAIN_AREAS.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.id}>
                <AppLink
                  to={a.to}
                  title={a.label}
                  aria-label={a.label}
                  aria-current={area === a.id ? 'page' : undefined}
                >
                  {Icon && (
                    <Icon className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                  <span className="label">{a.label}</span>
                  <span className="sheet-no">{a.no}</span>
                </AppLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-foot">
        <ThemeButton variant="side" />
        <AppLink
          className={cx('side-btn')}
          to="/einstellungen/konten"
          title="Einstellungen"
          aria-label="Einstellungen"
          aria-current={area === 'einstellungen' ? 'page' : undefined}
        >
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="label">Einstellungen</span>
        </AppLink>
        <div className="profile">
          <span className="avatar" aria-hidden="true">
            NU
          </span>
          <span className="profile-text">
            <strong>Profil</strong>
            <span>Passkey · dieses Gerät</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
