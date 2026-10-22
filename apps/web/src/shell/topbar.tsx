import { PanelLeft, Plus } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { PanelLink } from './panel-link';
import { InboxHeaderLink } from '../inbox/navigation';
import { useInboxCount } from './inbox';
import { PrivacyButton } from './privacy-button';

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
}: {
  collapsed: boolean;
  onToggle: () => void;
  onSearchChange?: (open: boolean) => void;
}) {
  const inbox = useInboxCount();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
        >
          <PanelLeft size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <GlobalSearch onOpenChange={onSearchChange} />
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
            <Plus size={20} strokeWidth={1.5} aria-hidden="true" />
            Buchung
          </PanelLink>
        </div>
      </div>
    </header>
  );
}
