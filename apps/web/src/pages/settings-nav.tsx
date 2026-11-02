import {
  ChevronLeft,
  ChevronRight,
  Database,
  Landmark,
  ListTree,
  Plug,
  TrendingUp,
  User,
} from 'lucide-react';
import { useLocation } from '@tanstack/react-router';
import { SETTINGS_GROUPS, areaById } from '../nav/areas';
import { AppLink } from '../shell/app-link';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { validateInboxSearch } from '../inbox/navigation';
import './settings-nav.css';

export interface SettingsNavProps {
  /** `rail`: vertical list beside the page (desktop only). `index`: full-width list (phone entry). */
  variant: 'rail' | 'index';
}

/**
 * Grouped navigation of Einstellungen. The redesign uses six groups; OFF retains the legacy list.
 * One list serves both layouts: the
 * rail sits left of every settings page on desktop, the index lists the same links as full-width
 * rows on the phone. The router marks the open page with `aria-current="page"` (exact match, like
 * the sidebar), so the mark follows the URL even while a lazy page is still loading.
 */
export function SettingsNav({ variant }: SettingsNavProps) {
  const pathname = useLocation({ select: (location) => location.pathname });
  return (
    <nav className={`settings-nav settings-nav-${variant}`} aria-label="Einstellungen">
      {SETTINGS_GROUPS.map((group) =>
        REDESIGN_ENABLED ? (
          <RedesignSettingsGroup
            key={group.id}
            group={group}
            variant={variant}
            pathname={pathname}
          />
        ) : (
          <div key={group.id} className="settings-group">
            <p className="tech settings-group-label" id={`settings-group-${group.id}`}>
              {group.label}
            </p>
            <ul aria-labelledby={`settings-group-${group.id}`}>
              {group.items.map((item) => (
                <li key={item.id}>
                  <AppLink
                    to={item.to}
                    {...(item.to === '/einstellungen/kontakte'
                      ? { 'aria-current': pathname === item.to ? ('page' as const) : undefined }
                      : {})}
                  >
                    <span className="settings-item-label">{item.label}</span>
                    <ChevronRight
                      className="settings-chevron"
                      size={16}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </AppLink>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </nav>
  );
}

const GROUP_ICONS = {
  profil: User,
  konten: Landmark,
  regeln: ListTree,
  verbindungen: Plug,
  vermoegen: TrendingUp,
  daten: Database,
};

function RedesignSettingsGroup({
  group,
  variant,
  pathname,
}: {
  group: (typeof SETTINGS_GROUPS)[number];
  variant: SettingsNavProps['variant'];
  pathname: string;
}) {
  const { search } = useLocation();
  const von = validateInboxSearch(search).von;
  const active = group.items.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const Icon = GROUP_ICONS[group.id as keyof typeof GROUP_ICONS];
  return (
    <details
      className="settings-group"
      key={`${group.id}-${active}`}
      open={variant === 'index' || active}
    >
      <summary className="settings-group-label" id={`settings-group-${group.id}`}>
        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        <span>{group.label}</span>
        <ChevronRight
          className="settings-group-chevron"
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </summary>
      <ul aria-labelledby={`settings-group-${group.id}`}>
        {group.items.map((item) => (
          <li key={item.id}>
            <AppLink
              to={item.to}
              search={von ? { von } : {}}
              aria-current={
                pathname === item.to || pathname.startsWith(`${item.to}/`) ? 'page' : undefined
              }
            >
              <span className="settings-item-label">{item.label}</span>
              <ChevronRight
                className="settings-chevron"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </AppLink>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Phone index return and current page; an explicit source return is also visible on desktop. */
export function SettingsBack({ current }: { current: string | undefined }) {
  const { search } = useLocation();
  const von = validateInboxSearch(search).von;
  const label = areaById('einstellungen').registers.find((r) => r.id === current)?.label;
  return (
    <div className="settings-back">
      <AppLink to="/einstellungen" {...(REDESIGN_ENABLED && von ? { search: { von } } : {})}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Einstellungen
      </AppLink>
      {label && <span className="settings-here">{label}</span>}
      {REDESIGN_ENABLED && von && (
        <AppLink to={von} className="settings-source-return">
          Zurück zur Ausgangsseite
        </AppLink>
      )}
    </div>
  );
}
