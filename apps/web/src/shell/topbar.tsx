import { Count } from '@budget/ui';
import { Inbox, PanelLeft, Plus } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { PanelLink } from './panel-link';
import { SAMPLE_INBOX_COUNT } from './inbox';

/** Desktop top bar: collapse toggle, search (Ctrl K), Posteingang with counter, "+ Buchung". */
export function Topbar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn"
        onClick={onToggle}
        aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
        aria-expanded={!collapsed}
        aria-controls="sidebar"
      >
        <PanelLeft size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <GlobalSearch />
      <div className="topbar-actions">
        <PanelLink className="btn btn-ghost" panel="posteingang">
          <Inbox size={18} strokeWidth={1.75} aria-hidden="true" />
          Posteingang <Count>{SAMPLE_INBOX_COUNT}</Count>
          <span className="sr-only"> offen</span>
        </PanelLink>
        <PanelLink
          className="btn btn-primary"
          panel="buchung"
          aria-keyshortcuts="n"
          title="Buchung erfassen (N)"
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          Buchung
        </PanelLink>
      </div>
    </header>
  );
}
