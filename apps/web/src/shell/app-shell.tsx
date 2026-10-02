import { ToastProvider, cx } from '@budget/ui';
import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { TITLE_ON_MOBILE_AREAS } from '../pages/area-head';
import { MobileHeader, TabBar, phoneTitle } from './mobile-chrome';
import { useActivePage } from './page-meta';
import { useCaptureShortcut } from './capture-shortcut';
import { PanelHost } from './panel-host';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { useStoredFlag } from './use-stored-flag';
import { usePrivacyShortcut } from './privacy-button';

const APP_NAME = 'Budget';

/**
 * Application shell: sidebar and top bar on desktop, header, tab bar and + button on the phone.
 * Both use the same routes and the same order of areas.
 */
export function AppShell() {
  usePrivacyShortcut();
  const [collapsed, setCollapsed] = useStoredFlag('budget-sidebar-collapsed');
  const page = useActivePage();
  const main = useRef<HTMLElement>(null);
  const title = page?.title ?? APP_NAME;
  useCaptureShortcut();

  useEffect(() => {
    document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`;
  }, [title]);

  return (
    <ToastProvider>
      <div className={cx('app', collapsed && 'is-collapsed')}>
        <a
          className="skip-link"
          href="#main"
          onClick={(event) => {
            event.preventDefault();
            main.current?.focus();
          }}
        >
          Zum Inhalt springen
        </a>
        <Sidebar area={page?.area} />
        <div className="main">
          <Topbar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <MobileHeader
            title={phoneTitle(page, title)}
            asHeading={!(page && TITLE_ON_MOBILE_AREAS.has(page.area))}
          />
          <main className="sheet" id="main" tabIndex={-1} ref={main}>
            <Outlet />
          </main>
        </div>
      </div>
      <TabBar area={page?.area} />
      <PanelHost />
      {/* Announces the new page to screen readers after client-side navigation. */}
      <div className="sr-only" role="status" aria-live="polite">
        {title}
      </div>
    </ToastProvider>
  );
}
