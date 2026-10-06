import { useAmountPrivacy, maskMoneyText, DetailPanel, setAmountsHidden } from '@budget/ui';
import { matchesSearch } from '@budget/domain';
import type { GlobalSearchResult, SearchKind } from '@budget/db';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { request } from '../api/http';
import { LEDGER_KEY } from '../ledger/queries';
import { AREAS } from '../nav/areas';
import { REPORTS } from '../nav/reports-catalog';
import { isTyping } from './capture-shortcut';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import './global-search.css';

type PaletteItem = Omit<GlobalSearchResult, 'kind'> & {
  kind: SearchKind | 'page' | 'report' | 'action';
};
const LABELS: Record<PaletteItem['kind'], string> = {
  page: 'Seite',
  report: 'Report',
  action: 'Aktion',
  account: 'Konto',
  category: 'Kategorie',
  payee: 'Empfänger',
  contact: 'Kontakt',
  booking: 'Buchung',
};
const PAGES: PaletteItem[] = AREAS.flatMap((area) => [
  { kind: 'page' as const, id: area.to, label: area.label, detail: null },
  ...area.registers.map((r) => ({
    kind: 'page' as const,
    id: r.to,
    label: `${area.label} · ${r.label}`,
    detail: null,
  })),
]);
const COMMANDS: PaletteItem[] = [
  { kind: 'action', id: 'buchung', label: 'Neue Buchung', detail: 'N' },
  { kind: 'action', id: 'posteingang', label: 'Posteingang öffnen', detail: null },
  {
    kind: 'action',
    id: 'monatsabschluss',
    label: 'Monatsabschluss starten',
    detail: 'Zuerst Kontostände prüfen',
  },
  {
    kind: 'action',
    id: 'privacy',
    label: 'Datenschutz-Modus umschalten',
    detail: 'Strg Umschalt H / ⌘ Umschalt H',
  },
];
const STATIC_ITEMS: PaletteItem[] = [
  ...COMMANDS,
  ...PAGES,
  ...REPORTS.map((r) => ({
    kind: 'report' as const,
    id: r.id,
    label: `${r.pos} ${r.name}`,
    detail: null,
  })),
];
// Only IDs in session memory; dynamic choices are revalidated by the server on opening.
let recent: Pick<PaletteItem, 'kind' | 'id'>[] = [];
const itemKey = (item: Pick<PaletteItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;
function destination(result: PaletteItem) {
  if (result.kind === 'page') return { to: result.id, search: {} };
  if (result.kind === 'report') return { to: `/reports/${result.id}`, search: {} };
  if (result.kind === 'account')
    return { to: `/konten/${encodeURIComponent(result.id)}`, search: {} };
  if (result.kind === 'contact') return { to: '/konten/kontakte', search: { kontakt: result.id } };
  const key =
    result.kind === 'category' ? 'kategorie' : result.kind === 'payee' ? 'empfaenger' : 'buchung';
  return { to: '/konten/buchungen', search: { [key]: result.id } };
}

/** Same query and keyboard flow on desktop and in the phone's existing bottom-sheet primitive. */
export function GlobalSearch({ mobile = false }: { mobile?: boolean }) {
  const hidden = useAmountPrivacy();
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
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
      if (window.matchMedia('(max-width: 767px)').matches !== mobile) return;
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        open &&
        !help &&
        event.target instanceof Node &&
        container.current?.contains(event.target)
      ) {
        event.preventDefault();
        input.current?.focus();
        setOpen(false);
        return;
      }
      if (
        event.key === '?' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !isTyping(event.target) &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        setHelp(true);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      if (document.querySelector('dialog[open]') && (!open || help)) return;
      event.preventDefault();
      setOpen(true);
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile, open, help]);

  const history = recent.filter(
    (r) => r.kind !== 'page' && r.kind !== 'report' && r.kind !== 'action',
  );
  const search = useQuery({
    queryKey: [...LEDGER_KEY, 'global-search', query, history],
    queryFn: () =>
      request<{ results: GlobalSearchResult[] }>(
        'GET',
        `/api/search?q=${encodeURIComponent(query)}${history.length ? `&recent=${encodeURIComponent(JSON.stringify(history))}` : ''}`,
      ),
    enabled: open && (text.length === 0 || text.length >= 2) && query === text,
    retry: false,
    gcTime: 0,
  });
  const loading =
    (text.length === 0 || text.length >= 2) &&
    (query !== text || search.isPending || search.isFetching);
  const remote = !loading && query === text && !search.isError ? (search.data?.results ?? []) : [];
  const candidates = [
    ...remote,
    ...STATIC_ITEMS.filter((item) => matchesSearch(`${item.label} ${item.id}`, text)),
  ];
  const results = [...new Map(candidates.map((item) => [itemKey(item), item])).values()];
  results.sort((a, b) => {
    const rank = (item: PaletteItem) => {
      const position = recent.findIndex((r) => itemKey(r) === itemKey(item));
      return position < 0 ? recent.length : position;
    };
    return rank(a) - rank(b);
  });
  const index = Math.min(active, results.length - 1);
  useEffect(() => {
    if (open && index >= 0)
      document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, index, listId]);
  const select = (result: PaletteItem) => {
    recent = [
      { kind: result.kind, id: result.id },
      ...recent.filter((r) => itemKey(r) !== itemKey(result)),
    ].slice(0, 8);
    setOpen(false);
    setValue('');
    setActive(0);
    input.current?.blur();
    if (result.kind === 'action') {
      if (result.id === 'privacy') setAmountsHidden(!hidden);
      else if (result.id === 'monatsabschluss')
        void navigate({ to: '/konten', search: {} } as never);
      else
        void navigate({
          to: '.',
          search: ((prev: Record<string, unknown>) => ({ ...prev, panel: result.id })) as never,
          state: { panelOpenedInApp: true } as never,
        });
    } else void navigate(destination(result) as never);
  };

  const field = (
    <div
      className={`global-search ${mobile ? 'is-mobile' : 'search'}`}
      ref={container}
      onBlur={(event) => {
        if (!mobile && !help && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
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
          aria-describedby={open ? `${listId}-status` : undefined}
          placeholder="Suchen: Seiten, Reports, Buchungen, Aktionen"
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
            {loading
              ? 'Suche wird geladen …'
              : search.isError
                ? 'Die Suche ist nicht verfügbar.'
                : results.length === 0
                  ? 'Keine Treffer.'
                  : `${results.length} Treffer · zuletzt verwendet zuerst · ? Tastenkürzel`}
          </div>
          {query === text && search.isError && (
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
                  {maskMoneyText(result.label)}
                  {result.detail && <small>{maskMoneyText(result.detail)}</small>}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setHelp(true)}>
            Tastenkürzel anzeigen (?)
          </button>
        </div>
      )}
    </div>
  );
  return (
    <>
      <KeyboardShortcuts open={help} onClose={() => setHelp(false)} />
      {mobile ? (
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
      )}
    </>
  );
}
