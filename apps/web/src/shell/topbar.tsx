import { Count } from '@budget/ui';
import { Inbox, PanelLeft, Plus, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PanelLink } from './panel-link';
import { SAMPLE_INBOX_COUNT } from './inbox';

/** Desktop top bar: collapse toggle, search (Ctrl K), Posteingang with counter, "+ Buchung". */
export function Topbar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        search.current?.focus();
        search.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      <label className="search">
        <span className="sr-only">Suchen</span>
        <Search className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={search}
          id="global-search"
          type="search"
          placeholder="Suchen: Buchung, Empfänger, Kategorie, Konto"
          autoComplete="off"
        />
        <span className="kbd" aria-hidden="true">
          Strg K
        </span>
      </label>
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
