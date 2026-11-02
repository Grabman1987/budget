import { PanelLeft, Plus } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { PanelLink } from './panel-link';
import { InboxHeaderLink } from '../inbox/navigation';
import { useInboxCount } from './inbox';
import { PrivacyButton } from './privacy-button';
import { useLocation } from '@tanstack/react-router';
import { REDESIGN_ENABLED } from './redesign-flag';
import '../budget/plan-page-frame.css';

/**
 * Desktop top bar. The bar spans the window, its content (`.topbar-inner`) is as wide as the page
 * column (`--page-max`) and uses the same side padding, so search and actions form one row above
 * the content instead of sitting at the window edge.
 *
 * Contents: collapse toggle, search (Ctrl K), privacy eye, Prüfen pill, "+ Buchung".
 */
export function Topbar({
  collapsed,
  onToggle,
  onSearchChange,
  title,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSearchChange?: (open: boolean) => void;
  title?: string;
}) {
  const inbox = useInboxCount();
  const pathname = useLocation({ select: (location) => location.pathname });
  const settings = REDESIGN_ENABLED && pathname.startsWith('/einstellungen');
  return (
    <header className={title ? 'topbar plan-shell-topbar' : 'topbar'}>
      <div className="topbar-inner">
        {settings && <h1 className="settings-shell-title">Einstellungen</h1>}
        <button
          type="button"
          className={title ? 'plan-shell-title' : 'icon-btn'}
          onClick={onToggle}
          aria-label={
            (title ? title + ' · ' : '') +
            (collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen')
          }
          aria-expanded={!collapsed}
          aria-controls="sidebar"
        >
          {title ?? <PanelLeft size={16} strokeWidth={1.75} aria-hidden="true" />}
        </button>
        <GlobalSearch compact={settings} compactLabel={!!title} onOpenChange={onSearchChange} />
        <div className="topbar-actions">
          <PrivacyButton />
          <InboxHeaderLink className="review-pill" aria-label={inbox.label}>
            Prüfen{inbox.count !== undefined && inbox.count > 0 ? ` · ${inbox.count}` : ''}
          </InboxHeaderLink>
          <PanelLink
            className="btn btn-primary"
            panel="buchung"
            aria-keyshortcuts="n"
            title="Buchung erfassen (N)"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Buchung
          </PanelLink>
        </div>
      </div>
    </header>
  );
}
