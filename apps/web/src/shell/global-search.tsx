import { useAmountPrivacy, maskMoneyText, DetailPanel } from '@budget/ui';
import type { GlobalSearchResult, SearchKind } from '@budget/db';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import './global-search.css';

const LABELS: Record<SearchKind, string> = {
  account: 'Konto',
  category: 'Kategorie',
  payee: 'Empfänger',
  contact: 'Kontakt',
  booking: 'Buchung',
};
function destination(result: GlobalSearchResult) {
  if (result.kind === 'account')
    return { to: `/konten/${encodeURIComponent(result.id)}`, search: {} };
  if (result.kind === 'contact') return { to: '/konten/kontakte', search: { kontakt: result.id } };
  const key =
    result.kind === 'category' ? 'kategorie' : result.kind === 'payee' ? 'empfaenger' : 'buchung';
  return { to: '/konten/buchungen', search: { [key]: result.id } };
}

/** Same query and keyboard flow on desktop and in the phone's existing bottom-sheet primitive. */
export function GlobalSearch({ mobile = false }: { mobile?: boolean }) {
  useAmountPrivacy();
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const text = value.trim();
  const listId = mobile ? 'global-search-mobile-results' : 'global-search-results';

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text), 180);
    return () => window.clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    if (mobile && open) input.current?.focus();
  }, [mobile, open]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      if (window.matchMedia('(max-width: 767px)').matches !== mobile) return;
      if (document.querySelector('dialog[open]') && !open) return;
      event.preventDefault();
      setOpen(true);
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile, open]);

  const search = useQuery({
    queryKey: [...LEDGER_KEY, 'global-search', query],
    queryFn: () =>
      request<{ results: GlobalSearchResult[] }>(
        'GET',
        `/api/search?q=${encodeURIComponent(query)}`,
      ),
    enabled: open && text.length >= 2 && query === text,
    retry: false,
    gcTime: 0,
  });
  const loading = text.length >= 2 && (query !== text || search.isPending);
  const results = !loading && query === text && !search.isError ? (search.data?.results ?? []) : [];
  const index = Math.min(active, results.length - 1);
  useEffect(() => {
    if (open && index >= 0)
      document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, index, listId]);
  const select = (result: GlobalSearchResult) => {
    setOpen(false);
    setValue('');
    input.current?.blur();
    void navigate(destination(result) as never);
  };

  const field = (
    <div
      className={`global-search ${mobile ? 'is-mobile' : 'search'}`}
      ref={container}
      onBlur={(event) => {
        if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="global-search-field">
        <span className="sr-only">Suchen</span>
        <Search className="icon" size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={input}
          id={mobile ? 'global-search-mobile' : 'global-search'}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && index >= 0 ? `${listId}-${index}` : undefined}
          aria-keyshortcuts="Control+k Meta+k"
          aria-describedby={`${listId}-status`}
          placeholder="Suchen: Buchung, Empfänger, Kategorie, Konto"
          autoComplete="off"
          maxLength={200}
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setValue(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (results.length)
                setActive(
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length,
                );
            } else if (event.key === 'Enter' && open && results[index]) {
              event.preventDefault();
              select(results[index]);
            }
          }}
        />
        {!mobile && (
          <span className="kbd" aria-hidden="true">
            Strg K
          </span>
        )}
      </label>
      {open && (
        <div className="global-search-popup">
          <div className="global-search-status" id={`${listId}-status`} role="status">
            {text.length < 2
              ? 'Mindestens zwei Zeichen eingeben.'
              : loading
                ? 'Suche wird geladen …'
                : search.isError
                  ? 'Die Suche ist nicht verfügbar.'
                  : results.length === 0
                    ? 'Keine Treffer.'
                    : `${results.length} Treffer · bis zu fünf je Art`}
          </div>
          {text.length >= 2 && query === text && search.isError && (
            <button type="button" className="btn btn-ghost" onClick={() => void search.refetch()}>
              Erneut versuchen
            </button>
          )}
          <div id={listId} role="listbox" aria-label="Suchergebnisse" aria-busy={loading}>
            {results.map((result, i) => (
              <button
                key={`${result.kind}-${result.id}`}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === index}
                tabIndex={-1}
                className="global-search-result"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(result)}
              >
                <span className="global-search-kind">{LABELS[result.kind]}</span>
                <span className="global-search-label">
                  {result.label}
                  {result.detail && <small>{maskMoneyText(result.detail)}</small>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
  return mobile ? (
    <>
      <button
        type="button"
        className="icon-btn global-search-trigger"
        aria-label="Suchen"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <DetailPanel open={open} onClose={() => setOpen(false)} title="Suchen">
        {field}
      </DetailPanel>
    </>
  ) : (
    field
  );
}
